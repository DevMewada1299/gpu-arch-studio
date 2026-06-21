"""Tests for agent memory.

InMemoryAgentMemory tests are pure/free. The RedisVL test is gated on redisvl +
REDIS_URL (and downloads a sentence-transformers model on first run).

Run directly:   python tests/agent_memory/test_agent_memory.py
Or via pytest:  pytest tests/agent_memory/test_agent_memory.py
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

from backend.agent_memory import InMemoryAgentMemory, memory_text
from backend.models import AgentOutput, Experiment, GPUConfig, SimStats

HAVE_REDISVL = importlib.util.find_spec("redisvl") is not None
HAVE_REDIS_URL = bool(os.environ.get("REDIS_URL"))


def _exp(eid, clusters, ipc):
    return Experiment(
        exp_id=eid, config=GPUConfig(n_clusters=clusters), stats=SimStats(ipc=ipc),
        benchmark="dct8x8", container_id="x", timestamp=0.0, status="success",
    )


def test_memory_text():
    exp = _exp("e1", 30, 459.0)
    analysis = {"bottleneck": AgentOutput("bottleneck", "Compute-bound: scales with SMs.", "amber")}
    t = memory_text(exp, analysis)
    assert "clusters=30" in t and "ipc=459" in t and "Compute-bound" in t


def test_inmemory_recall_ranks_similar_first():
    m = InMemoryAgentMemory()
    m.remember("a", "clusters=30 scheduler=gto compute-bound high ipc")
    m.remember("b", "clusters=8 scheduler=lrr memory-bandwidth-bound low ipc")
    m.remember("c", "clusters=60 scheduler=gto compute-bound very high ipc")
    assert m.count() == 3

    hits = m.recall("clusters=30 scheduler=gto compute-bound", k=2)
    assert len(hits) == 2
    # the exact-ish gto/compute-bound entries should outrank the lrr one
    ids = [h["exp_id"] for h in hits]
    assert "b" not in ids, ids
    assert hits[0]["score"] >= hits[1]["score"]


def test_inmemory_empty_recall():
    assert InMemoryAgentMemory().recall("anything") == []


def test_redisvl_round_trip():
    if not (HAVE_REDISVL and HAVE_REDIS_URL):
        print("SKIP: redisvl / REDIS_URL not available")
        return
    from backend.agent_memory import RedisVLAgentMemory

    m = RedisVLAgentMemory(os.environ["REDIS_URL"])
    m.remember("rv_test1", "clusters=30 scheduler=gto compute-bound high ipc",
               metadata={"ipc": 459.0})
    hits = m.recall("compute-bound config with many clusters", k=3)
    assert any(h["exp_id"] == "rv_test1" for h in hits), hits
    print("PASS: test_redisvl_round_trip")
    for h in hits:
        print(f"  {h['exp_id']}  score={h['score']}  {h['text'][:60]}")


if __name__ == "__main__":
    for fn in [test_memory_text, test_inmemory_recall_ranks_similar_first,
               test_inmemory_empty_recall]:
        fn()
        print(f"PASS: {fn.__name__}")
    test_redisvl_round_trip()
