"""End-to-end test: run the JPEG benchmark through docker_manager and confirm
GPGPU-Sim completes (prints SUCCESS). This is the make-or-break test — it
exercises the ENV_PREAMBLE that lets the benchmark find libcudart.so.4.

Run directly:   python tests/docker_manager/test_run_benchmark.py
Or via pytest:  pytest tests/docker_manager/test_run_benchmark.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend.docker_manager import FALLBACK_CONTAINER, exec_in_container

BENCH_DIR = "/tmp/benchmarks/JPEG"
BENCH_CMD = "./gpgpu_ptx_sim__JPEG --encode --file=cameraman.bmp"


def test_benchmark_completes_with_success():
    code, out = exec_in_container(FALLBACK_CONTAINER, BENCH_CMD, workdir=BENCH_DIR)
    assert code == 0, f"benchmark exited {code}\n{out[-2000:]}"
    assert "SUCCESS" in out, f"no SUCCESS marker in output\n{out[-2000:]}"


if __name__ == "__main__":
    code, out = exec_in_container(FALLBACK_CONTAINER, BENCH_CMD, workdir=BENCH_DIR)
    tail = "\n".join(out.splitlines()[-8:])
    print(tail)
    print("=" * 60)
    if code == 0 and "SUCCESS" in out:
        print("PASS: benchmark completed with SUCCESS")
        sys.exit(0)
    print(f"FAIL: exit={code}, SUCCESS marker={'SUCCESS' in out}")
    sys.exit(1)
