"""DEMO: a bad GPU config crashes GPGPU-Sim, and Sentry captures it WITH the
config attached — the reliability story made concrete.

It reproduces the proven crash class (n_clusters=30 with a MISMATCHED
interconnect → segfault) and reports it to Sentry the same way the runner's
sim_error path does. Restores the container's baseline afterward.

Note: the normal runner AUTO-generates a matching interconnect, so real
exploration no longer hits this — this test deliberately recreates the failure
to demonstrate the capture. Any genuine sim failure is captured identically.

Run (needs docker + SENTRY_DSN; ~10s):
    python tests/monitoring/test_failure_capture.py
Then check Sentry → Issues for the crash with the config attached.
"""
import importlib.util
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

JPEG = "/tmp/benchmarks/JPEG"
BENCH_CMD = "./gpgpu_ptx_sim__JPEG --encode --file=cameraman.bmp"


def main():
    if importlib.util.find_spec("docker") is None:
        print("SKIP: docker not installed")
        return 0
    from backend import docker_manager, monitoring
    from backend.config_generator import generate_config, generate_files, load_icnt_template

    enabled = monitoring.init_sentry()
    print(f"Sentry enabled: {enabled}")

    bad = {"n_clusters": 30, "cores_per_cluster": 1, "n_mem": 6, "shmem_size": 49152,
           "scheduler": "gto", "num_sched_per_core": 2, "l1_sets": 32, "l2_sets": 64}

    # 30-cluster config WITH the baseline k=27 interconnect (deliberately mismatched).
    files = {
        "gpgpusim.config": generate_config(bad),
        "config_fermi_islip.icnt": load_icnt_template(),  # k=27, wrong for 30 clusters
    }
    print("Pushing a deliberately-broken config (30 clusters, k=27 interconnect)...")
    docker_manager.put_files(docker_manager.FALLBACK_CONTAINER, JPEG, files)

    exit_code, output = docker_manager.exec_in_container(
        docker_manager.FALLBACK_CONTAINER, BENCH_CMD, workdir=JPEG
    )
    crashed = "SUCCESS" not in output
    tail = "\n".join(output.splitlines()[-3:])
    print(f"sim exit={exit_code}  crashed={crashed}\n  tail: {tail}")

    if crashed:
        monitoring.capture_message(
            "GPGPU-Sim crashed on an AI-proposed config (interconnect mismatch)",
            level="error", config=bad, exit_code=exit_code,
        )
        if enabled:
            import sentry_sdk

            sentry_sdk.flush(timeout=5)
            print("→ Reported the crash to Sentry WITH the config. Check Issues.")
        else:
            print("(Sentry disabled — set SENTRY_DSN to actually report it.)")

    # restore baseline so the container is clean
    docker_manager.put_files(docker_manager.FALLBACK_CONTAINER, JPEG, generate_files({}))
    print("(restored baseline config)")

    assert crashed, "expected the mismatched config to crash GPGPU-Sim"
    return 0


if __name__ == "__main__":
    sys.exit(main())
