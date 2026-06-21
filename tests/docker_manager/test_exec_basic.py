"""Smoke test: exec primitives — plain commands, workdir, and streaming.

Run directly:   python tests/docker_manager/test_exec_basic.py
Or via pytest:  pytest tests/docker_manager/test_exec_basic.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend.docker_manager import (
    FALLBACK_CONTAINER,
    exec_in_container,
    stream_in_container,
)


def test_echo_runs():
    code, out = exec_in_container(FALLBACK_CONTAINER, "echo hello-from-python", with_env=False)
    assert code == 0
    assert "hello-from-python" in out


def test_workdir_is_respected():
    code, out = exec_in_container(
        FALLBACK_CONTAINER, "pwd", with_env=False, workdir="/tmp/benchmarks/JPEG"
    )
    assert code == 0
    assert out.strip() == "/tmp/benchmarks/JPEG"


def test_streaming_yields_lines():
    lines = list(
        stream_in_container(
            FALLBACK_CONTAINER, "printf 'line1\\nline2\\nline3\\n'", with_env=False
        )
    )
    assert lines == ["line1", "line2", "line3"]


if __name__ == "__main__":
    failures = 0
    for name, fn in [
        ("echo", test_echo_runs),
        ("workdir", test_workdir_is_respected),
        ("streaming", test_streaming_yields_lines),
    ]:
        try:
            fn()
            print(f"PASS: {name}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL: {name} — {e}")
    sys.exit(1 if failures else 0)
