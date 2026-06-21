"""The autonomous exploration loop — the product's centerpiece.

explore() drives the agentic design-space search:

    propose config -> run sim -> agents analyze -> orchestrator reasons over the
    FULL history -> proposes the next config -> repeat until converged or budget.

It's a generator that yields event dicts (consumed by the /explore SSE endpoint;
also runnable standalone). Dependencies are injectable (run_fn / analyze_fn /
propose_fn) so it's testable without Docker or API calls, and so a demo-replay
mode can feed pre-run experiments while keeping the agent reasoning live.
"""

from typing import Callable, Dict, Iterator, List, Optional

from . import agent_engine  # safe: agent_engine imports anthropic lazily
from .models import GPUConfig

DEFAULT_MAX_ITERATIONS = 6


def compute_pareto(history: List[dict]) -> List[str]:
    """Pareto frontier over (maximize IPC, minimize SM count as a cost proxy).

    A successful experiment is on the frontier if no other has both >= IPC and
    <= n_clusters (with at least one strictly better). Returns exp_ids.
    """
    pts = [
        (h["experiment"].exp_id, h["experiment"].stats.ipc, h["experiment"].config.n_clusters)
        for h in history
        if h["experiment"].status == "success" and h["experiment"].stats.ipc is not None
    ]
    frontier = []
    for eid, ipc, cost in pts:
        dominated = any(
            (o_ipc >= ipc and o_cost <= cost) and (o_ipc > ipc or o_cost < cost)
            for o_eid, o_ipc, o_cost in pts
            if o_eid != eid
        )
        if not dominated:
            frontier.append(eid)
    return frontier


def _best_exp_id(history: List[dict]) -> Optional[str]:
    best = None
    for h in history:
        exp = h["experiment"]
        if exp.status == "success" and exp.stats.ipc is not None:
            if best is None or exp.stats.ipc > best[1]:
                best = (exp.exp_id, exp.stats.ipc)
    return best[0] if best else None


def _config_key(c: GPUConfig) -> tuple:
    return tuple(sorted(c.to_dict().items()))


def explore(
    goal: str,
    benchmark: str = "dct8x8",
    constraints: Optional[dict] = None,
    start_config: Optional[GPUConfig] = None,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    container=None,
    store=None,
    run_fn: Optional[Callable] = None,
    analyze_fn: Optional[Callable] = None,
    propose_fn: Optional[Callable] = None,
) -> Iterator[Dict]:
    """Run the autonomous exploration, yielding event dicts.

    Events: iteration_start, experiment, analysis, proposal, converged, error.
    """
    if run_fn is None:
        from . import runner  # lazy: pulls in docker only when actually running sims

        run_fn = runner.run_experiment
    analyze_fn = analyze_fn or agent_engine.analyze
    propose_fn = propose_fn or agent_engine.propose_next

    config = start_config or GPUConfig()
    history: List[dict] = []
    tried = set()

    for i in range(max_iterations):
        yield {"type": "iteration_start", "iteration": i, "config": config.to_dict()}
        tried.add(_config_key(config))

        try:
            exp = run_fn(config, benchmark=benchmark, container=container, store=store)
        except Exception as exc:  # noqa: BLE001 - surface, don't crash the loop
            yield {"type": "error", "iteration": i, "message": f"{type(exc).__name__}: {exc}"}
            return

        yield {
            "type": "experiment", "iteration": i, "exp_id": exp.exp_id,
            "status": exp.status, "config": exp.config.to_dict(),
            "stats": exp.stats.to_dict(), "error": exp.error,
        }

        analysis = analyze_fn(exp.stats, exp.config, benchmark)
        yield {
            "type": "analysis", "iteration": i,
            "agents": {k: v.to_dict() for k, v in analysis.items()},
        }

        history.append({"experiment": exp, "analysis": analysis})

        decision = propose_fn(history, goal, constraints)
        yield {
            "type": "proposal", "iteration": i,
            "reasoning": decision.reasoning,
            "next_config": decision.next_config.to_dict() if decision.next_config else None,
            "converged": decision.converged,
            "best_exp_id": decision.best_exp_id,
            "best_reason": decision.best_reason,
        }

        if decision.converged:
            break
        if decision.next_config is None:
            # Not a convergence — the orchestrator returned no usable config
            # (parse/budget failure). Surface it rather than silently stopping.
            yield {"type": "note", "iteration": i,
                   "message": "no next_config from orchestrator (empty/unparseable "
                              "proposal) — stopping early"}
            break
        if _config_key(decision.next_config) in tried:
            yield {"type": "note", "iteration": i,
                   "message": "orchestrator re-proposed a tried config — stopping"}
            break
        config = decision.next_config

    yield {
        "type": "converged",
        "best_exp_id": _best_exp_id(history),
        "pareto": compute_pareto(history),
        "iterations": len(history),
    }
