"""Smoke test: can we discover a running GPGPU-Sim container?

Run directly:   python tests/docker_manager/test_get_containers.py
Or via pytest:  pytest tests/docker_manager/test_get_containers.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend.docker_manager import get_containers


def test_get_containers_returns_running_container():
    containers = get_containers()
    assert containers, "no GPGPU-Sim container found (is relaxed_shaw running?)"
    for c in containers:
        assert set(c) >= {"id", "name", "image", "status"}
        assert c["status"] == "running"


if __name__ == "__main__":
    found = get_containers()
    if not found:
        print("FAIL: no running container discovered")
        sys.exit(1)
    print(f"PASS: discovered {len(found)} container(s)")
    for c in found:
        print(f"  - {c['name']:<16} {c['id']}  {c['image']}  ({c['status']})")
