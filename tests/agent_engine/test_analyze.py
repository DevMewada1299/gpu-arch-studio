"""Tests for the agent engine.

Two tiers:
  * test_status_parsing — pure, free, always runs.
  * test_analyze_live   — ONE real analyze() (3 cheap Haiku calls, ~$0.001).
    Skipped unless ANTHROPIC_API_KEY is set. Run in the venv with `anthropic`
    installed and the key in your environment/.env.

Run directly:   python tests/agent_engine/test_analyze.py
Or via pytest:  pytest tests/agent_engine/test_analyze.py
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

from backend.agent_engine import SPECIALISTS, _parse_status
from backend.models import GPUConfig, SimStats

import importlib.util

HAVE_KEY = bool(os.environ.get("ANTHROPIC_API_KEY"))
HAVE_SDK = importlib.util.find_spec("anthropic") is not None
CAN_RUN_LIVE = HAVE_KEY and HAVE_SDK

# Realistic baseline DCT8x8 stats (compute-bound: tiny DRAM stalls vs cycles)
BASELINE = SimStats(
    ipc=315.2309, total_insn=18710528, total_cycles=59355, occupancy=0.3241,
    l1_hit_rate=0.4583, l2_hit_rate=0.699, l1i_hit_rate=0.9839,
    dram_stalls=876, shmem_stalls=49638, l2_bw=82.2801, sim_time_sec=21,
)


def test_status_parsing():
    assert _parse_status("...analysis...\nSTATUS: GREEN") == "green"
    assert _parse_status("STATUS: red") == "red"
    assert _parse_status("first STATUS: AMBER then STATUS: RED") == "red"  # last wins
    assert _parse_status("no marker here") == "amber"  # safe default


def test_analyze_live():
    if not CAN_RUN_LIVE:
        why = "ANTHROPIC_API_KEY not set" if not HAVE_KEY else "anthropic SDK not installed"
        print(f"SKIP: {why}")
        return
    out = analyze_once()
    assert set(out) == set(SPECIALISTS)
    for agent in SPECIALISTS:
        o = out[agent]
        assert o.text and len(o.text) > 40, f"{agent} produced no real analysis"
        assert o.status in ("green", "amber", "red")
        # specificity check: a sharp agent quotes actual numbers
        assert any(tok in o.text for tok in ("315", "0.", "%", "stall", "IPC", "ipc")), (
            f"{agent} analysis looks generic: {o.text!r}"
        )
    print("PASS: test_analyze_live")
    for agent in SPECIALISTS:
        print(f"\n[{agent}] STATUS={out[agent].status}\n{out[agent].text}")


def analyze_once():
    from backend.agent_engine import analyze

    return analyze(BASELINE, GPUConfig(), "dct8x8")


if __name__ == "__main__":
    test_status_parsing()
    print("PASS: test_status_parsing")
    test_analyze_live()
