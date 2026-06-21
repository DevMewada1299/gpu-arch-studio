"""End-to-end runner test: GPUConfig -> real sim -> parsed Experiment.

Requires the venv (docker SDK) and a running container. Runs two real
simulations, so it takes ~30-60s.

Run directly:   python tests/runner/test_run_experiment.py
Or via pytest:  pytest tests/runner/test_run_experiment.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend import docker_manager
from backend.config_generator import generate_files
from backend.models import GPUConfig
from backend.runner import run_experiment
from backend.store import InMemoryExperimentStore


def _restore_baseline():
    """Leave the container's config back at baseline after the test."""
    docker_manager.put_files(
        docker_manager.FALLBACK_CONTAINER,
        "/tmp/benchmarks/JPEG",
        generate_files({}),
    )


def test_baseline_run_succeeds_and_is_stored():
    store = InMemoryExperimentStore()
    exp = run_experiment(GPUConfig(), store=store)

    assert exp.status == "success", exp.error
    assert exp.stats.ipc and exp.stats.ipc > 0
    assert exp.stats.l1_hit_rate is not None
    assert exp.config.n_clusters == 15
    # persisted and retrievable
    assert store.get(exp.exp_id) is exp
    assert exp in store.get_all()


def test_30_clusters_runs_via_auto_interconnect():
    # Would SEGFAULT if the runner didn't emit a matching interconnect (k=42).
    exp = run_experiment(GPUConfig(n_clusters=30))
    assert exp.status == "success", exp.error
    assert exp.stats.ipc and exp.stats.ipc > 0


if __name__ == "__main__":
    failures = 0
    for fn in [test_baseline_run_succeeds_and_is_stored,
               test_30_clusters_runs_via_auto_interconnect]:
        try:
            fn()
            print(f"PASS: {fn.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL: {fn.__name__} — {e}")
    _restore_baseline()
    print("=" * 60)
    print("restored baseline config to container")
    sys.exit(1 if failures else 0)
