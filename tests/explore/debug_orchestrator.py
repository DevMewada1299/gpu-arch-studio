"""Diagnostic: dump the RAW orchestrator response so we can see why the loop
stops at iteration 0. Replicates agent_engine.propose_next's exact call, but
prints stop_reason, usage, every content block, and the raw text.

Run:  python tests/explore/debug_orchestrator.py        (one Sonnet call, ~$0.01)
"""
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from backend import agent_engine
from backend.agent_engine import ORCHESTRATOR_MODEL, PROMPT_DIR, _format_history, _parse_decision
from backend.models import AgentOutput, Experiment, GPUConfig, SimStats


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("SKIP: ANTHROPIC_API_KEY not set")
        return

    history = [{
        "experiment": Experiment(
            exp_id="794c84c0", config=GPUConfig(),
            stats=SimStats(ipc=315.2309, occupancy=0.3241, l1_hit_rate=0.4583,
                           l2_hit_rate=0.699, dram_stalls=876, shmem_stalls=49638,
                           l2_bw=82.28, total_insn=18710528, total_cycles=59355),
            benchmark="dct8x8", container_id="relaxed_shaw", timestamp=0.0,
            status="success"),
        "analysis": {
            "memory": AgentOutput("memory", "L2 hit 70%, DRAM not saturated.", "amber"),
            "warp": AgentOutput("warp", "Occupancy 32% but IPC 315, latency-tolerant.", "amber"),
            "bottleneck": AgentOutput("bottleneck",
                "Compute-bound: DRAM stalls <2% of cycles; IPC scales with SMs.", "amber"),
        },
    }]

    with open(os.path.join(PROMPT_DIR, "orchestrator.md")) as f:
        system = f.read()
    latest = history[-1]["analysis"]
    latest_block = "\n".join(f"  {a}: {latest[a].text}" for a in agent_engine.SPECIALISTS if a in latest)
    user = (
        "GOAL: maximize IPC\nCONSTRAINTS: {\"max_n_clusters\": 30}\n\n"
        f"EXPERIMENT HISTORY (oldest first):\n{_format_history(history)}\n\n"
        f"LATEST ANALYSIS:\n{latest_block}"
    )

    client = agent_engine._get_client()
    print(f"model={ORCHESTRATOR_MODEL}  max_tokens=2000  thinking=adaptive effort=high\n")
    resp = client.messages.create(
        model=ORCHESTRATOR_MODEL, max_tokens=2000,
        thinking={"type": "adaptive"}, output_config={"effort": "high"},
        system=system, messages=[{"role": "user", "content": user}],
    )

    print(f"stop_reason = {resp.stop_reason}")
    print(f"usage = {resp.usage}")
    print("content blocks:")
    for b in resp.content:
        if b.type == "thinking":
            print(f"  [thinking] {len(getattr(b,'thinking','') or '')} chars")
        elif b.type == "text":
            print(f"  [text] {len(b.text)} chars")
        else:
            print(f"  [{b.type}]")

    text = "".join(b.text for b in resp.content if b.type == "text")
    print(f"\n=== RAW TEXT ({len(text)} chars) ===\n{text!r}")
    print(f"\n=== PARSED ===\n{_parse_decision(text).to_dict()}")


if __name__ == "__main__":
    main()
