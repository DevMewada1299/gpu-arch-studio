"""Tests for the orchestrator parser, Pareto, and the explore loop.

Pure tests inject fake run/analyze/propose fns — no Docker, no API, free.
test_orchestrator_live makes ONE Sonnet call (~$0.01), skipped without a key.

Run directly:   python tests/explore/test_explore.py
Or via pytest:  pytest tests/explore/test_explore.py
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

from backend.agent_engine import _parse_decision
from backend.explore import compute_pareto, explore
from backend.models import AgentOutput, Experiment, GPUConfig, SimStats

HAVE_KEY = bool(os.environ.get("ANTHROPIC_API_KEY"))
HAVE_SDK = importlib.util.find_spec("anthropic") is not None
CAN_RUN_LIVE = HAVE_KEY and HAVE_SDK


# --- orchestrator output parsing (free) ----------------------------------

def test_parse_decision_proposes():
    text = (
        "REASONING: Baseline at 15 clusters hit IPC 315 with negligible DRAM "
        "stalls — compute-bound, so more SMs should help.\n"
        'NEXT_CONFIG: {"n_clusters": 30, "cores_per_cluster": 1, "n_mem": 6, '
        '"shmem_size": 49152, "scheduler": "gto", "num_sched_per_core": 2, '
        '"l1_sets": 32, "l2_sets": 64}\n'
        "CONVERGED: false\n"
        "BEST_SO_FAR: exp ab12cd34 — highest IPC so far at 315.\n"
    )
    d = _parse_decision(text)
    assert "compute-bound" in d.reasoning
    assert d.next_config is not None and d.next_config.n_clusters == 30
    assert d.converged is False
    assert d.best_exp_id == "ab12cd34"


def test_parse_decision_markdown_format():
    # The EXACT shape Sonnet 4.6 emitted in the live loop (## headers + ```json
    # fences) that broke the first parser. Must parse cleanly now.
    text = '''REASONING: Single data point at IPC 315 with <2% DRAM stalls — compute-bound, double the SMs.

## NEXT_CONFIG:
```json
{
  "n_clusters": 30,
  "cores_per_cluster": 1,
  "n_mem": 6,
  "shmem_size": 49152,
  "scheduler": "gto",
  "num_sched_per_core": 1,
  "l1_sets": 32,
  "l2_sets": 64
}
```

## CONVERGED: false

## BEST_SO_FAR: abcd1234 — establishes the compute-bound baseline.
'''
    d = _parse_decision(text)
    assert d.next_config is not None and d.next_config.n_clusters == 30, "markdown JSON not parsed"
    assert d.next_config.num_sched_per_core == 1
    assert d.converged is False
    assert "compute-bound" in d.reasoning
    assert d.best_exp_id == "abcd1234"


def test_parse_decision_converged():
    text = (
        "REASONING: IPC plateaued; bottleneck is now memory and constraints block "
        "more channels.\nNEXT_CONFIG: null\nCONVERGED: true\n"
        "BEST_SO_FAR: exp ffee0011 — best IPC/area tradeoff.\n"
    )
    d = _parse_decision(text)
    assert d.next_config is None
    assert d.converged is True


# --- pareto (free) -------------------------------------------------------

def _exp(eid, ipc, clusters, status="success"):
    return {
        "experiment": Experiment(
            exp_id=eid, config=GPUConfig(n_clusters=clusters),
            stats=SimStats(ipc=ipc), benchmark="dct8x8",
            container_id="x", timestamp=0.0, status=status,
        )
    }


def test_compute_pareto():
    hist = [
        _exp("a", 315.0, 15),   # frontier: cheapest
        _exp("b", 457.0, 30),   # frontier: fastest
        _exp("c", 400.0, 30),   # dominated by b (same cost, lower IPC)
        _exp("d", 100.0, 8, status="error"),  # excluded: failed
    ]
    front = set(compute_pareto(hist))
    assert front == {"a", "b"}, front


# --- explore loop with injected fakes (free) -----------------------------

def test_explore_loop_with_fakes():
    # fake sim: IPC scales with clusters
    def fake_run(config, benchmark=None, container=None, store=None):
        ipc = 300.0 + config.n_clusters * 5
        return Experiment(
            exp_id=f"e{config.n_clusters}", config=config, stats=SimStats(ipc=ipc),
            benchmark="dct8x8", container_id="x", timestamp=0.0, status="success",
        )

    def fake_analyze(stats, config, benchmark):
        return {a: AgentOutput(agent=a, text=f"{a} ok", status="amber")
                for a in ("memory", "warp", "bottleneck")}

    calls = {"n": 0}

    def fake_propose(history, goal, constraints, recalled=None):
        from backend.models import OrchestratorDecision
        calls["n"] += 1
        if calls["n"] == 1:
            return OrchestratorDecision(reasoning="try more SMs",
                                        next_config=GPUConfig(n_clusters=30))
        return OrchestratorDecision(reasoning="plateaued", next_config=None, converged=True)

    events = list(explore(
        "maximize ipc", start_config=GPUConfig(n_clusters=15), max_iterations=6,
        run_fn=fake_run, analyze_fn=fake_analyze, propose_fn=fake_propose,
    ))
    types = [e["type"] for e in events]
    assert types.count("experiment") == 2
    assert types.count("analysis") == 2
    assert types.count("proposal") == 2
    assert types[-1] == "converged"
    final = events[-1]
    assert final["best_exp_id"] == "e30"          # 30 clusters → highest IPC
    assert set(final["pareto"]) == {"e15", "e30"}  # both on the frontier
    assert final["iterations"] == 2


def test_explore_loop_uses_memory():
    from backend.agent_memory import InMemoryAgentMemory

    def fake_run(config, benchmark=None, container=None, store=None):
        return Experiment(
            exp_id=f"e{config.n_clusters}", config=config,
            stats=SimStats(ipc=300.0 + config.n_clusters), benchmark="dct8x8",
            container_id="x", timestamp=0.0, status="success")

    def fake_analyze(stats, config, benchmark):
        return {a: AgentOutput(agent=a, text=f"{a} note", status="amber")
                for a in ("memory", "warp", "bottleneck")}

    seen_recalled = {"val": "unset"}

    def fake_propose(history, goal, constraints, recalled=None):
        from backend.models import OrchestratorDecision
        seen_recalled["val"] = recalled  # capture what memory fed the orchestrator
        return OrchestratorDecision(reasoning="done", next_config=None, converged=True)

    mem = InMemoryAgentMemory()
    events = list(explore(
        "maximize ipc", start_config=GPUConfig(n_clusters=15), max_iterations=1,
        memory=mem, run_fn=fake_run, analyze_fn=fake_analyze, propose_fn=fake_propose,
    ))
    types = [e["type"] for e in events]
    assert "recall" in types, "no recall event emitted"
    assert mem.count() == 1, "experiment not stored in memory"
    assert seen_recalled["val"] is not None, "recalled not passed to orchestrator"
    assert seen_recalled["val"][0]["exp_id"] == "e15"


# --- live orchestrator (1 Sonnet call, gated) ----------------------------

def test_orchestrator_live():
    if not CAN_RUN_LIVE:
        print("SKIP: ANTHROPIC_API_KEY / anthropic SDK not available")
        return
    from backend.agent_engine import propose_next

    history = [{
        "experiment": Experiment(
            exp_id="abcd1234", config=GPUConfig(),
            stats=SimStats(ipc=315.2, occupancy=0.32, l1_hit_rate=0.46,
                           l2_hit_rate=0.70, dram_stalls=876),
            benchmark="dct8x8", container_id="x", timestamp=0.0, status="success",
        ),
        "analysis": {
            "bottleneck": AgentOutput(
                agent="bottleneck",
                text="Compute-bound: DRAM stalls <2% of cycles; IPC scales with SMs.",
                status="amber"),
        },
    }]
    d = propose_next(history, goal="maximize IPC", constraints={"max_n_clusters": 30})
    assert d.reasoning, "orchestrator gave no reasoning"
    assert d.converged or d.next_config is not None, "no decision produced"
    if d.next_config:
        assert d.next_config.n_clusters <= 30, "violated the constraint"
    print("PASS: test_orchestrator_live")
    print(f"\nREASONING: {d.reasoning}\nNEXT: "
          f"{d.next_config.to_dict() if d.next_config else None}\nCONVERGED: {d.converged}")


if __name__ == "__main__":
    for fn in [test_parse_decision_proposes, test_parse_decision_markdown_format,
               test_parse_decision_converged,
               test_compute_pareto, test_explore_loop_with_fakes,
               test_explore_loop_uses_memory]:
        fn()
        print(f"PASS: {fn.__name__}")
    test_orchestrator_live()
