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

import json
import os
import re
from typing import Callable, Dict, List, Optional

from . import monitoring
from .models import AgentOutput, GPUConfig, OrchestratorDecision, SimStats

PROMPT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "agents")

SPECIALIST_MODEL = os.environ.get("SPECIALIST_MODEL", "claude-haiku-4-5")
ORCHESTRATOR_MODEL = os.environ.get("ORCHESTRATOR_MODEL", "claude-sonnet-4-6")

SPECIALISTS = ("memory", "warp", "bottleneck")
_STATUS_RE = re.compile(r"STATUS:\s*(GREEN|AMBER|RED)", re.IGNORECASE)

_client = None


def _demo_no_key() -> bool:
    """In DEMO_MODE with no API key, agents return canned (but config-aware)
    analysis so the whole loop runs offline — for frontend/demo without keys."""
    return os.environ.get("DEMO_MODE") == "1" and not os.environ.get("ANTHROPIC_API_KEY")


def _demo_specialist_text(agent: str, stats: SimStats, config: GPUConfig) -> str:
    if agent == "memory":
        return (f"L2 hit {stats.l2_hit_rate} with only {stats.dram_stalls} DRAM-full "
                f"stalls at {config.n_clusters} clusters — bandwidth isn't the limiter; "
                f"L1 miss traffic is low-reuse streaming. STATUS: AMBER  [demo]")
    if agent == "warp":
        return (f"Occupancy {stats.occupancy} yet IPC {stats.ipc} — latency-tolerant "
                f"kernel; the {config.scheduler} scheduler suits the DCT tiles. "
                f"STATUS: AMBER  [demo]")
    return ("Compute-bound: DRAM stalls are a small fraction of cycles and L2 BW is "
            "far from saturated; IPC scales with SM count. Highest leverage: more "
            "clusters. STATUS: AMBER  [demo]")


def _demo_decision(history: List[dict], constraints: Optional[dict]) -> OrchestratorDecision:
    maxc = (constraints or {}).get("max_n_clusters", 60)
    last = history[-1]["experiment"].config
    best = max(history, key=lambda h: h["experiment"].stats.ipc or 0)["experiment"]
    nxt = next((s for s in (8, 15, 30, 60) if s > last.n_clusters and s <= maxc), None)
    if nxt is None:
        return OrchestratorDecision(
            reasoning="[demo] IPC plateaued within the constraints — converged.",
            next_config=None, converged=True, best_exp_id=best.exp_id,
            best_reason=f"highest IPC {best.stats.ipc}")
    cfg = GPUConfig.from_dict({**last.to_dict(), "n_clusters": nxt})
    return OrchestratorDecision(
        reasoning=f"[demo] Compute-bound; scaling clusters {last.n_clusters}->{nxt} "
                  f"to raise IPC (others fixed for attributability).",
        next_config=cfg, converged=False, best_exp_id=best.exp_id,
        best_reason=f"highest IPC so far {best.stats.ipc}")


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

    if _demo_no_key():
        txt = _demo_specialist_text(agent, stats, config)
        if on_text:
            on_text(txt)
        return AgentOutput(agent=agent, text=txt, status=_parse_status(txt))

    system = _load_prompt(agent)
    user = _stats_block(stats, config, benchmark)
    if extra_context:
        user += f"\n\n{extra_context}"

    client = _get_client()
    text = ""
    with monitoring.transaction(f"agent:{agent}", "agent.analyze", model=SPECIALIST_MODEL):
        try:
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
        except Exception as exc:  # rate limit / API error — reliability of the agent layer
            monitoring.capture_exception(exc, agent=agent, model=SPECIALIST_MODEL)
            raise

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


# --- Orchestrator (Mode B) ------------------------------------------------

# Labels may arrive bare or wrapped in markdown ("## NEXT_CONFIG:", "**REASONING:**").
_LABELS = ("REASONING", "NEXT_CONFIG", "CONVERGED", "BEST_SO_FAR")
_NEXT_LABEL = r"(?:\n\s*[#*]{0,3}\s*(?:REASONING|NEXT_CONFIG|CONVERGED|BEST_SO_FAR)\b|\Z)"


def _section(text: str, label: str) -> str:
    """Extract a labeled section, tolerating markdown prefixes/emphasis."""
    pat = rf"[#*]{{0,3}}\s*{label}\*{{0,2}}\s*:?\s*(.*?){_NEXT_LABEL}"
    m = re.search(pat, text, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip(" *#`\n") if m else ""


def _format_history(history: List[dict]) -> str:
    """Compact one-line-per-experiment summary for the orchestrator prompt."""
    if not history:
        return "(none yet — this is the first proposal)"
    lines = []
    for h in history:
        exp = h["experiment"]
        c, s = exp.config, exp.stats
        bott = h.get("analysis", {}).get("bottleneck")
        bott_note = f" bottleneck={bott.status}" if bott else ""
        lines.append(
            f"  exp {exp.exp_id}: clusters={c.n_clusters} cores={c.cores_per_cluster} "
            f"n_mem={c.n_mem} shmem={c.shmem_size} sched={c.scheduler} "
            f"l1_sets={c.l1_sets} l2_sets={c.l2_sets} -> ipc={s.ipc} occ={s.occupancy} "
            f"l1_hit={s.l1_hit_rate} l2_hit={s.l2_hit_rate} dram_stalls={s.dram_stalls} "
            f"[{exp.status}]{bott_note}"
        )
    return "\n".join(lines)


def _parse_decision(text: str) -> OrchestratorDecision:
    reasoning = _section(text, "REASONING")
    converged = "true" in _section(text, "CONVERGED").lower()
    best = _section(text, "BEST_SO_FAR")

    # Find the config JSON anywhere in the text (robust to markdown/code fences):
    # the first flat {...} block that contains "n_clusters". Our config has no
    # nested objects, so a non-brace body is a safe, fence-proof match.
    next_config = None
    explicit_null = bool(
        re.search(r"NEXT_CONFIG[^\n{]*?:\s*[`*]*\s*null", text, re.IGNORECASE)
    )
    if not explicit_null:
        for m in re.finditer(r"\{[^{}]*\}", text, re.DOTALL):
            blob = m.group(0)
            if "n_clusters" in blob:
                try:
                    next_config = GPUConfig.from_dict(json.loads(blob))
                    break
                except (ValueError, json.JSONDecodeError):
                    continue

    # Reasoning fallback: if the labeled section was empty, use the text that
    # precedes the config JSON (still real architect reasoning, just unlabeled).
    if not reasoning:
        cut = text.find("{")
        reasoning = (text[:cut] if cut > 0 else text).strip(" *#`\n")

    exp_id_m = re.search(r"\b([0-9a-f]{8})\b", best)
    return OrchestratorDecision(
        reasoning=reasoning,
        next_config=next_config,
        converged=converged,
        best_exp_id=exp_id_m.group(1) if exp_id_m else None,
        best_reason=best,
    )


def propose_next(
    history: List[dict],
    goal: str,
    constraints: Optional[dict] = None,
    recalled: Optional[List[dict]] = None,
    on_text: Optional[Callable[[str], None]] = None,
) -> OrchestratorDecision:
    """The orchestrator: reason over the full history, propose the next config.

    `history` is the explore loop's list of {"experiment": Experiment,
    "analysis": {agent: AgentOutput}}. `recalled` is an optional list of
    semantically-similar past experiments from agent memory (RedisVL) to ground
    the proposal in prior experience. Uses Sonnet 4.6 with adaptive thinking.
    """
    if _demo_no_key():
        return _demo_decision(history, constraints)

    with open(os.path.join(PROMPT_DIR, "orchestrator.md")) as f:
        system = f.read()

    latest = history[-1]["analysis"] if history else {}
    latest_block = "\n".join(
        f"  {a}: {latest[a].text}" for a in SPECIALISTS if a in latest
    )
    recall_block = ""
    if recalled:
        recall_block = "\n\nRELEVANT PRIOR EXPERIMENTS (semantic recall from memory):\n" + "\n".join(
            f"  - {r.get('text', '')}" for r in recalled
        )
    user = (
        f"GOAL: {goal}\n"
        f"CONSTRAINTS: {json.dumps(constraints) if constraints else 'none'}\n\n"
        f"EXPERIMENT HISTORY (oldest first):\n{_format_history(history)}\n\n"
        f"LATEST ANALYSIS:\n{latest_block or '(none)'}"
        f"{recall_block}"
    )

    client = _get_client()
    # max_tokens must cover adaptive-thinking tokens AND the answer. 2000 was too
    # small: with verbose specialist analyses in the prompt, thinking consumed the
    # whole budget and the text answer came back empty (the loop then stalled at
    # iteration 0). 8000 leaves ample room for both.
    kwargs = dict(
        model=ORCHESTRATOR_MODEL,
        max_tokens=8000,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = ""
    with monitoring.transaction("agent:orchestrator", "agent.orchestrate",
                                model=ORCHESTRATOR_MODEL):
        try:
            if on_text is not None:
                with client.messages.stream(**kwargs) as stream:
                    for chunk in stream.text_stream:
                        text += chunk
                        on_text(chunk)
            else:
                resp = client.messages.create(**kwargs)
                text = "".join(b.text for b in resp.content if b.type == "text")
        except Exception as exc:  # rate limit / API error
            monitoring.capture_exception(exc, agent="orchestrator", model=ORCHESTRATOR_MODEL)
            raise

    return _parse_decision(text)
