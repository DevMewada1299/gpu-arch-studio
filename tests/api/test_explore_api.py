"""End-to-end test of POST /explore + its SSE stream, against a RUNNING server.

Drives the full autonomous loop over HTTP (real sims + live agents). Bounded to
2 iterations to keep it short (~$0.15, ~1 min).

Start the server first, then run this:
    # terminal 1
    uvicorn backend.main:app --port 8000
    # terminal 2
    python tests/api/test_explore_api.py
"""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8000"


def _post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    body = {
        "goal": "maximize IPC for the JPEG/DCT8x8 workload",
        "constraints": {"max_n_clusters": 30},
        "max_iterations": 2,
    }
    session_id = _post("/explore", body)["session_id"]
    print(f"PASS: POST /explore -> session_id={session_id}")

    seen = {"iteration_start": 0, "experiment": 0, "analysis": 0, "proposal": 0}
    ipcs, final = [], None
    with urllib.request.urlopen(f"{BASE}/explore/{session_id}/stream", timeout=300) as r:
        for raw in r:
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            ev = json.loads(line[len("data:"):].strip())
            t = ev["type"]
            seen[t] = seen.get(t, 0) + 1
            if t == "experiment":
                ipc = ev["stats"].get("ipc")
                ipcs.append(ipc)
                print(f"  iter {ev['iteration']}: REAL SIM exp {ev['exp_id']} IPC={ipc}")
            elif t == "proposal":
                nc = ev["next_config"]
                print(f"  iter {ev['iteration']}: orchestrator converged={ev['converged']} "
                      f"next_clusters={nc['n_clusters'] if nc else None}")
            elif t == "converged":
                final = ev
                print(f"  CONVERGED best={ev['best_exp_id']} pareto={ev['pareto']}")
                break
            elif t in ("error", "note"):
                print(f"  {t}: {ev.get('message')}")

    assert seen["experiment"] >= 1, "no experiments streamed"
    assert seen["analysis"] >= 1, "no agent analysis streamed"
    assert seen["proposal"] >= 1, "no orchestrator proposal streamed"
    assert final is not None, "stream ended without a converged event"
    print("=" * 60)
    print(f"ALL /explore SSE CHECKS PASSED  (IPCs: {ipcs})")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        print(f"Could not reach {BASE} — is uvicorn running? ({e})")
        sys.exit(1)
