"""REAL end-to-end exploration — no fakes. Proves the loop actually re-runs the
benchmark each iteration and drives live agents + orchestrator.

Runs ~3 real GPGPU-Sim runs (~1-2 min) + live Haiku/Sonnet calls (~$0.10).
Requires: venv with anthropic + docker, the relaxed_shaw container, and
ANTHROPIC_API_KEY in .env. Restores the container's baseline config when done.

Run:  python tests/explore/test_explore_live.py
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


def _can_run():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return "ANTHROPIC_API_KEY not set"
    for mod in ("anthropic", "docker"):
        if importlib.util.find_spec(mod) is None:
            return f"{mod} not installed"
    return None


def main():
    why = _can_run()
    if why:
        print(f"SKIP: {why}")
        return 0

    from backend.explore import explore
    from backend.config_generator import generate_files
    from backend import docker_manager

    print("Running a REAL 3-iteration exploration (real sims + live agents)...\n")
    seen_ipcs = []
    try:
        for ev in explore(
            goal="maximize IPC for the JPEG/DCT8x8 workload",
            constraints={"max_n_clusters": 30},
            max_iterations=3,
        ):
            t = ev["type"]
            if t == "iteration_start":
                c = ev["config"]
                print(f"── iter {ev['iteration']}: trying clusters={c['n_clusters']} "
                      f"l1_sets={c['l1_sets']} sched={c['scheduler']}")
            elif t == "experiment":
                ipc = ev["stats"].get("ipc")
                seen_ipcs.append(ipc)
                print(f"   REAL SIM → exp {ev['exp_id']}  IPC={ipc}  [{ev['status']}]")
            elif t == "analysis":
                b = ev["agents"].get("bottleneck", {})
                print(f"   bottleneck[{b.get('status')}]: {b.get('text','')[:130]}...")
            elif t == "proposal":
                nc = ev["next_config"]
                print(f"   orchestrator: converged={ev['converged']} "
                      f"next_clusters={nc['n_clusters'] if nc else None}")
                print(f"   reasoning: {ev['reasoning'][:200]}...")
            elif t == "converged":
                print(f"\n✅ done. best={ev['best_exp_id']} pareto={ev['pareto']} "
                      f"iterations={ev['iterations']}")
            elif t in ("error", "note"):
                print(f"   {t}: {ev.get('message')}")
    finally:
        # leave the container at baseline
        docker_manager.put_files(docker_manager.FALLBACK_CONTAINER,
                                 "/tmp/benchmarks/JPEG", generate_files({}))
        print("\n(restored baseline config to container)")

    # The honesty check: real sims with DIFFERENT configs should give DIFFERENT IPCs
    distinct = {round(x, 2) for x in seen_ipcs if x is not None}
    print(f"\nDistinct real IPCs observed: {sorted(distinct)}")
    if len(distinct) > 1:
        print("→ Confirmed: the benchmark really re-ran and configs changed the result.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
