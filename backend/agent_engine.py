"""The agentic engine — Claude agents that analyze real simulation stats.

Mode A (this module): given one experiment's SimStats + config, the three
specialist agents (Memory, Warp, Bottleneck) produce sharp, numbers-grounded
analysis. Mode B (the autonomous explore loop + orchestrator proposals) builds
on this and lands in runner/explore later.

Model strategy (tiered for cost — see claude-api reference pricing):
  * specialists -> Haiku 4.5 (cheap, focused, run 3x per iteration)
  * orchestrator -> Sonnet 4.6 with adaptive thinking + high effort (the hard
    reasoning; runs once per iteration)
Both overridable via env vars so the tier can be dialed per budget.

Agents emit free-text analysis ending in `STATUS: GREEN|AMBER|RED`. We parse the
status from the tail — this streams cleanly (no structured-output/streaming
conflict) and matches the prompt contract in agents/*.md. An optional `on_text`
callback streams tokens for the SSE layer.
"""

import os
import re
from typing import Callable, Dict, Optional

from .models import AgentOutput, GPUConfig, SimStats

PROMPT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "agents")

SPECIALIST_MODEL = os.environ.get("SPECIALIST_MODEL", "claude-haiku-4-5")
ORCHESTRATOR_MODEL = os.environ.get("ORCHESTRATOR_MODEL", "claude-sonnet-4-6")

SPECIALISTS = ("memory", "warp", "bottleneck")
_STATUS_RE = re.compile(r"STATUS:\s*(GREEN|AMBER|RED)", re.IGNORECASE)

_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic  # lazy import so the package works without it installed

        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env
    return _client


def _load_prompt(agent: str) -> str:
    with open(os.path.join(PROMPT_DIR, f"{agent}_agent.md")) as f:
        return f.read()


def _parse_status(text: str) -> str:
    m = _STATUS_RE.findall(text)
    return m[-1].lower() if m else "amber"


def _stats_block(stats: SimStats, config: GPUConfig, benchmark: str) -> str:
    s, c = stats, config
    return (
        f"Benchmark: {benchmark}\n"
        f"Config: n_clusters={c.n_clusters}, cores_per_cluster={c.cores_per_cluster}, "
        f"n_mem={c.n_mem}, shmem_size={c.shmem_size}, scheduler={c.scheduler}, "
        f"num_sched_per_core={c.num_sched_per_core}, l1_sets={c.l1_sets}, l2_sets={c.l2_sets}\n"
        f"Stats: ipc={s.ipc}, occupancy={s.occupancy}, l1_hit_rate={s.l1_hit_rate}, "
        f"l2_hit_rate={s.l2_hit_rate}, l1i_hit_rate={s.l1i_hit_rate}, "
        f"dram_stalls={s.dram_stalls}, shmem_stalls={s.shmem_stalls}, "
        f"l2_bw={s.l2_bw}, total_insn={s.total_insn}, total_cycles={s.total_cycles}"
    )


def run_specialist(
    agent: str,
    stats: SimStats,
    config: GPUConfig,
    benchmark: str,
    extra_context: str = "",
    on_text: Optional[Callable[[str], None]] = None,
) -> AgentOutput:
    """Run one specialist agent on an experiment and return its analysis."""
    if agent not in SPECIALISTS:
        raise ValueError(f"unknown specialist {agent!r}; have {SPECIALISTS}")

    system = _load_prompt(agent)
    user = _stats_block(stats, config, benchmark)
    if extra_context:
        user += f"\n\n{extra_context}"

    client = _get_client()
    text = ""
    if on_text is not None:
        with client.messages.stream(
            model=SPECIALIST_MODEL, max_tokens=600, system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            for chunk in stream.text_stream:
                text += chunk
                on_text(chunk)
    else:
        resp = client.messages.create(
            model=SPECIALIST_MODEL, max_tokens=600, system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")

    return AgentOutput(agent=agent, text=text.strip(), status=_parse_status(text))


def analyze(
    stats: SimStats,
    config: GPUConfig,
    benchmark: str,
    on_text: Optional[Callable[[str, str], None]] = None,
) -> Dict[str, AgentOutput]:
    """Mode A: run the specialist agents on one experiment.

    Memory and Warp run first; the Bottleneck agent synthesizes their analyses.
    `on_text(agent, chunk)` streams tokens per agent if provided.

    Returns {agent_name: AgentOutput}.
    """
    out: Dict[str, AgentOutput] = {}

    for agent in ("memory", "warp"):
        cb = (lambda chunk, a=agent: on_text(a, chunk)) if on_text else None
        out[agent] = run_specialist(agent, stats, config, benchmark, on_text=cb)

    synthesis = (
        f"Memory Agent said: {out['memory'].text}\n\n"
        f"Warp Agent said: {out['warp'].text}"
    )
    cb = (lambda chunk: on_text("bottleneck", chunk)) if on_text else None
    out["bottleneck"] = run_specialist(
        "bottleneck", stats, config, benchmark, extra_context=synthesis, on_text=cb
    )
    return out
