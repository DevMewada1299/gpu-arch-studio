"""The experiment runner — turns a GPUConfig into a stored Experiment.

Pipeline (Reality Notes 2-5 handled end to end):
    GPUConfig
      -> config_generator.generate_files()   (config + matching interconnect)
      -> docker_manager.put_files()          (ship both INTO the container)
      -> docker_manager.exec_in_container()  (run with the env preamble)
      -> stats_parser.parse_stats()          (real fields, last occurrence)
      -> Experiment                          (saved via an ExperimentStore)

Design choices that keep later layers additive (see the layering discussion):
  * Returns a storage-agnostic Experiment; persistence is an injected store.
  * A simulation failure is a RESULT (status="error"), not a crash — and is
    reported to Sentry for reliability monitoring.
  * Plain callable: explore() and the Fetch.ai uAgents call this directly.
"""

import os
import time
import uuid
from typing import Callable, Optional, Union

from . import monitoring  # docker_manager imported lazily (DEMO_MODE needs no docker)
from .config_generator import generate_files
from .models import Experiment, GPUConfig, SimStats
from .report_parser import parse_report
from .stats_parser import is_success, parse_stats
from .store import ExperimentStore

# DEMO_MODE replays captured GPGPU-Sim output instead of running Docker — lets
# the frontend (and judges) run the full real API with no container, no daemon.
DEMO_MODE = os.environ.get("DEMO_MODE") == "1"
_REPO_ROOT = os.path.dirname(os.path.dirname(__file__))
_DEMO_SAMPLE = os.path.join(_REPO_ROOT, "sample", "out.txt")
_demo_output_cache: Optional[str] = None


def _load_demo_output() -> str:
    global _demo_output_cache
    if _demo_output_cache is None:
        with open(_DEMO_SAMPLE) as f:
            _demo_output_cache = f.read()
    return _demo_output_cache


def _demo_ipc(config: GPUConfig, base: float) -> float:
    """Make replayed IPC respond to the config so exploration looks real."""
    ipc = base * (config.n_clusters / 15.0)
    if config.l1_sets >= 64:
        ipc *= 1.03
    if config.scheduler == "two_level_active":
        ipc *= 1.02
    if config.num_sched_per_core >= 4:
        ipc *= 1.02
    return round(ipc, 4)

# Benchmark registry: name -> where it lives and how to run it in the container.
BENCHMARKS = {
    "dct8x8": {
        "dir": "/tmp/benchmarks/JPEG",
        "cmd": "./gpgpu_ptx_sim__JPEG --encode --file=cameraman.bmp",
    },
}
DEFAULT_BENCHMARK = "dct8x8"

# Generated artifacts written into the benchmark dir (and archived host-side).
_CONFIG_FILES = ("gpgpusim.config", "config_fermi_islip.icnt")

EXPERIMENTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "experiments")


def _resolve_target_container(container) -> str:
    """Return a container name to run in (first discovered if none given)."""
    if container is not None:
        return container if isinstance(container, str) else container.name
    from . import docker_manager

    found = docker_manager.get_containers()
    if not found:
        raise RuntimeError("no GPGPU-Sim container available to run in")
    return found[0]["name"]


def run_experiment(
    config: Union[GPUConfig, dict],
    benchmark: str = DEFAULT_BENCHMARK,
    container=None,
    store: Optional[ExperimentStore] = None,
    save_artifacts: bool = True,
    exp_id: Optional[str] = None,
    on_line: Optional[Callable[[str], None]] = None,
) -> Experiment:
    """Run one config on one container and return a (stored) Experiment.

    Never raises on a *simulation* failure — returns an Experiment with
    status="error". Infrastructure errors (no container, docker unreachable)
    are also captured and returned as status="error".

    Args:
        exp_id: pre-assigned id (the API assigns one so it can return it before
            the run finishes); generated if None.
        on_line: if given, the sim is streamed and this is called for each
            output line (used by the SSE endpoint). Without it, output is
            captured in one shot (and the exit code checked).
    """
    if isinstance(config, dict):
        config = GPUConfig.from_dict(config)
    if benchmark not in BENCHMARKS:
        raise ValueError(f"unknown benchmark {benchmark!r}; have {list(BENCHMARKS)}")

    exp_id = exp_id or uuid.uuid4().hex[:8]
    timestamp = time.time()
    bench = BENCHMARKS[benchmark]
    container_id = ""

    def _build(status: str, stats: SimStats, error: Optional[str], log_path) -> Experiment:
        exp = Experiment(
            exp_id=exp_id,
            config=config,
            stats=stats,
            benchmark=benchmark,
            container_id=container_id,
            timestamp=timestamp,
            status=status,
            error=error,
            log_path=log_path,
        )
        if store is not None:
            try:
                store.save(exp)
            except Exception as exc:  # noqa: BLE001 - persistence is best-effort
                # A flaky datastore must NOT lose a successful run. Capture and
                # carry on — the result is still returned/streamed to the user.
                monitoring.capture_exception(exc, exp_id=exp_id, where="store.save")
        return exp

    # DEMO_MODE: replay captured output instead of touching Docker.
    if DEMO_MODE:
        output = _load_demo_output()
        stats = parse_stats(output)
        report = parse_report(output)
        stats.ipc = _demo_ipc(config, stats.ipc or 315.0)
        container_id = "demo"
        if on_line is not None:
            for line in (
                "[demo] GPGPU-Sim replay (no Docker)",
                f"[demo] config: {config.n_clusters} clusters, scheduler={config.scheduler}",
                "[demo] simulating DCT8x8...",
                f"gpu_tot_ipc = {stats.ipc}",
                "SUCCESS",
            ):
                on_line(line)
                time.sleep(0.15)
        else:
            time.sleep(0.5)  # feel like a real run for streaming UIs
        log_path = _archive(exp_id, {"gpgpusim.config": "# demo replay\n"}, output) if save_artifacts else None
        if save_artifacts:
            _archive_report(exp_id, report)
        if store is not None:
            try:
                store.save_report(exp_id, report)
            except Exception:  # noqa: BLE001
                pass
        return _build("success", stats, None, log_path)

    from . import docker_manager  # real path only

    # Trace every sim as a Sentry transaction tagged with the config, so runs
    # are filterable in Performance and failures (e.g. a config that segfaults
    # GPGPU-Sim) surface as issues WITH the offending config attached.
    exit_code: Optional[int] = None
    with monitoring.transaction(
        f"sim:{benchmark}", "sim.run",
        benchmark=benchmark, n_clusters=config.n_clusters,
        scheduler=config.scheduler, l1_sets=config.l1_sets, l2_sets=config.l2_sets,
    ) as txn:
        try:
            container_id = _resolve_target_container(container)
            files = generate_files(config.to_dict())
            docker_manager.put_files(container_id, bench["dir"], files)

            if on_line is not None:
                lines = []
                for line in docker_manager.stream_in_container(
                    container_id, bench["cmd"], workdir=bench["dir"]
                ):
                    lines.append(line)
                    on_line(line)
                output = "\n".join(lines)  # exit_code stays None when streaming
            else:
                exit_code, output = docker_manager.exec_in_container(
                    container_id, bench["cmd"], workdir=bench["dir"]
                )
        except Exception as exc:  # infrastructure failure (docker, container, etc.)
            monitoring.capture_exception(
                exc, exp_id=exp_id, benchmark=benchmark, config=config.to_dict()
            )
            if txn:
                txn.set_tag("result", "infra_error")
            return _build("error", SimStats(), f"{type(exc).__name__}: {exc}", None)

        stats = parse_stats(output)
        report = parse_report(output)  # rich tier for the deep-dive view
        log_path = _archive(exp_id, files, output) if save_artifacts else None
        if save_artifacts:
            _archive_report(exp_id, report)
        if store is not None:
            try:
                store.save_report(exp_id, report)
            except Exception as exc:  # noqa: BLE001 - best-effort
                monitoring.capture_exception(exc, exp_id=exp_id, where="store.save_report")

        if is_success(output) and (exit_code is None or exit_code == 0):
            if txn:
                txn.set_tag("result", "success")
                txn.set_data("ipc", stats.ipc)
            return _build("success", stats, None, log_path)

        # Simulation failure (e.g. segfault from an invalid config) — the
        # reliability story: report it to Sentry with the full config.
        error = f"simulation did not report SUCCESS (exit {exit_code})"
        if txn:
            txn.set_tag("result", "sim_error")
        monitoring.capture_message(
            error, level="error", exp_id=exp_id, benchmark=benchmark,
            exit_code=exit_code, config=config.to_dict(),
        )
        return _build("error", stats, error, log_path)


def _archive(exp_id: str, files: dict, output: str) -> str:
    """Save the generated configs + full output to experiments/{exp_id}/."""
    exp_dir = os.path.join(EXPERIMENTS_DIR, exp_id)
    os.makedirs(exp_dir, exist_ok=True)
    for name, content in files.items():
        with open(os.path.join(exp_dir, name), "w") as f:
            f.write(content)
    log_path = os.path.join(exp_dir, "output.log")
    with open(log_path, "w") as f:
        f.write(output)
    return log_path


def _archive_report(exp_id: str, report) -> None:
    """Save the structured rich report alongside the raw log."""
    import json

    exp_dir = os.path.join(EXPERIMENTS_DIR, exp_id)
    os.makedirs(exp_dir, exist_ok=True)
    with open(os.path.join(exp_dir, "report.json"), "w") as f:
        json.dump(report.to_dict(), f, indent=2)
