"""End-to-end API test against a RUNNING server (stdlib only, no extra deps).

Start the server first, then run this:
    # terminal 1
    uvicorn backend.main:app --port 8000
    # terminal 2
    python tests/api/test_api_e2e.py

Drives the real contract: health -> containers -> run -> SSE stream -> history.
Runs one real simulation, so allow ~20s.
"""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8000"


def _get(path):
    with urllib.request.urlopen(BASE + path, timeout=30) as r:
        return json.load(r)


def _post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        BASE + path, data=data, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    health = _get("/health")
    assert health.get("ok") is True
    print(f"PASS: /health  benchmarks={health['benchmarks']}")

    containers = _get("/containers")
    assert isinstance(containers, list) and containers, "no containers reported"
    print(f"PASS: /containers  -> {[c['name'] for c in containers]}")

    baseline = {
        "config": {"n_clusters": 15, "cores_per_cluster": 1, "n_mem": 6,
                   "shmem_size": 49152, "scheduler": "gto",
                   "num_sched_per_core": 2, "l1_sets": 32, "l2_sets": 64},
        "benchmark": "dct8x8",
    }
    exp_id = _post("/experiments/run", baseline)["exp_id"]
    print(f"PASS: /experiments/run -> exp_id={exp_id}")

    # consume the SSE stream until the 'complete' event
    final = None
    n_output = 0
    with urllib.request.urlopen(f"{BASE}/experiments/{exp_id}/stream", timeout=120) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            ev = json.loads(line[len("data:"):].strip())
            if ev["type"] == "output":
                n_output += 1
            elif ev["type"] == "complete":
                final = ev
                break
            elif ev["type"] == "error":
                raise AssertionError(f"run errored: {ev}")
    assert final is not None, "stream ended with no complete event"
    assert final["status"] == "success", final
    assert final["stats"]["ipc"] and final["stats"]["ipc"] > 0
    print(f"PASS: /stream  ({n_output} output lines)  IPC={final['stats']['ipc']}")

    history = _get("/experiments/history")
    assert any(e["exp_id"] == exp_id for e in history), "run not in history"
    print(f"PASS: /experiments/history  ({len(history)} experiments)")

    print("=" * 60)
    print("ALL API E2E CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        print(f"Could not reach the server at {BASE} — is uvicorn running? ({e})")
        sys.exit(1)
