"""FastAPI app — exposes the simulation pipeline over the API contract.

Endpoints (see CLAUDE.md):
    GET  /containers
    POST /experiments/run            -> {exp_id}; runs in the background
    GET  /experiments/{id}/stream    -> SSE: {type:output,line} ... {type:complete,stats}
    GET  /experiments/history
    GET  /experiments/{id}
    POST /explore                    -> 501 until the agent core lands

Storage is chosen at startup: RedisExperimentStore if REDIS_URL is set and
reachable, else the in-memory store (real data, not persisted). Sentry is
initialized if SENTRY_DSN is set (no-op otherwise).

Run it:  uvicorn backend.main:app --reload --port 8000
"""

import asyncio
import json
import os
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import docker_manager, monitoring
from .explore import explore
from .models import GPUConfig
from .runner import BENCHMARKS, DEFAULT_BENCHMARK, run_experiment
from .store import InMemoryExperimentStore

# Load .env (REDIS_URL, SENTRY_DSN, ...) so `uvicorn backend.main:app` just works
# without manually exporting. Harmless if python-dotenv isn't installed.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

monitoring.init_sentry()  # no-op unless SENTRY_DSN is set


def _make_store():
    if os.environ.get("DISABLE_REDIS") == "1":
        print("[store] DISABLE_REDIS=1 -> in-memory store")
        return InMemoryExperimentStore()
    url = os.environ.get("REDIS_URL")
    if url:
        try:
            from .redis_store import RedisExperimentStore

            store = RedisExperimentStore(url)
            store.ping()
            print("[store] using Redis")
            return store
        except Exception as exc:  # noqa: BLE001
            print(f"[store] Redis unavailable ({exc}); falling back to in-memory")
    print("[store] using in-memory store")
    return InMemoryExperimentStore()


STORE = _make_store()

from .agent_memory import make_agent_memory

AGENT_MEMORY = make_agent_memory()

app = FastAPI(title="GPU Architecture Studio API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- request models -------------------------------------------------------

class GPUConfigIn(BaseModel):
    n_clusters: int = 15
    cores_per_cluster: int = 1
    n_mem: int = 6
    shmem_size: int = 49152
    scheduler: str = "gto"
    num_sched_per_core: int = 2
    l1_sets: int = 32
    l2_sets: int = 64


class RunRequest(BaseModel):
    config: GPUConfigIn
    benchmark: str = DEFAULT_BENCHMARK
    container_id: Optional[str] = None


# --- in-process run registry (for SSE) ------------------------------------

class RunHandle:
    """Buffers a run's SSE events so late subscribers still see everything."""

    def __init__(self, container_id: Optional[str]):
        self.events: List[dict] = []
        self.done = False
        self.container_id = container_id


RUNS: Dict[str, RunHandle] = {}


async def _run_job(exp_id: str, config: GPUConfig, benchmark: str, container_id):
    handle = RUNS[exp_id]
    loop = asyncio.get_running_loop()

    def on_line(line: str):
        # called from the worker thread -> hop back to the loop thread to append
        loop.call_soon_threadsafe(
            handle.events.append, {"type": "output", "line": line}
        )

    try:
        exp = await asyncio.to_thread(
            run_experiment,
            config,
            benchmark,
            container_id,
            STORE,
            True,        # save_artifacts
            exp_id,      # exp_id
            on_line,     # on_line
        )
        handle.events.append(
            {
                "type": "complete",
                "exp_id": exp_id,
                "status": exp.status,
                "error": exp.error,
                "config": exp.config.to_dict(),
                "stats": exp.stats.to_dict(),
            }
        )
    except Exception as exc:  # noqa: BLE001
        monitoring.capture_exception(exc, exp_id=exp_id)
        handle.events.append({"type": "error", "message": str(exc)})
    finally:
        handle.done = True


# --- endpoints ------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True, "benchmarks": list(BENCHMARKS)}


@app.get("/containers")
def containers():
    busy = {h.container_id for h in RUNS.values() if not h.done and h.container_id}
    out = []
    for c in docker_manager.get_containers():
        out.append({**c, "busy": c["name"] in busy or c["id"] in busy})
    return out


@app.post("/experiments/run")
async def experiments_run(req: RunRequest):
    if req.benchmark not in BENCHMARKS:
        raise HTTPException(400, f"unknown benchmark {req.benchmark!r}")
    exp_id = os.urandom(4).hex()
    config = GPUConfig.from_dict(req.config.model_dump())
    RUNS[exp_id] = RunHandle(req.container_id)
    asyncio.create_task(_run_job(exp_id, config, req.benchmark, req.container_id))
    return {"exp_id": exp_id}


def _sse_response(handle: "RunHandle") -> StreamingResponse:
    """SSE from a buffered handle — replays all events then tails new ones.
    Late subscribers still see everything (events are buffered, not consumed)."""

    async def gen():
        i = 0
        while True:
            while i < len(handle.events):
                yield f"data: {json.dumps(handle.events[i])}\n\n"
                i += 1
            if handle.done:
                break
            await asyncio.sleep(0.1)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/experiments/{exp_id}/stream")
async def experiments_stream(exp_id: str):
    handle = RUNS.get(exp_id)
    if handle is None:
        raise HTTPException(404, f"no run {exp_id!r} (or it predates this server)")
    return _sse_response(handle)


@app.get("/experiments/history")
def experiments_history():
    return [e.to_dict() for e in STORE.get_all()]


@app.get("/experiments/{exp_id}")
def experiment_get(exp_id: str):
    exp = STORE.get(exp_id)
    if exp is None:
        raise HTTPException(404, f"no experiment {exp_id!r}")
    return exp.to_dict()


@app.get("/experiments/{exp_id}/details")
def experiment_details(exp_id: str):
    """Rich SimReport for the Nsight-style deep-dive (per-SM heatmap, traffic,
    warp distribution, latency histograms, DRAM bottlenecks)."""
    report = STORE.get_report(exp_id)
    if report is None:
        raise HTTPException(404, f"no report for {exp_id!r}")
    return report.to_dict()


class ExploreRequest(BaseModel):
    goal: str
    benchmark: str = DEFAULT_BENCHMARK
    constraints: Optional[dict] = None
    max_iterations: int = 6
    start_config: Optional[GPUConfigIn] = None
    container_id: Optional[str] = None


EXPLORES: Dict[str, RunHandle] = {}


async def _explore_job(session_id: str, params: dict):
    handle = EXPLORES[session_id]
    loop = asyncio.get_running_loop()

    def producer():
        # explore() is a sync generator (runs blocking sims + agent calls);
        # iterate it in a worker thread and hand each event back to the loop.
        for ev in explore(**params):
            loop.call_soon_threadsafe(handle.events.append, ev)

    try:
        await asyncio.to_thread(producer)
    except Exception as exc:  # noqa: BLE001
        monitoring.capture_exception(exc, session_id=session_id)
        handle.events.append({"type": "error", "message": str(exc)})
    finally:
        handle.done = True


@app.post("/explore")
async def explore_start(req: ExploreRequest):
    if req.benchmark not in BENCHMARKS:
        raise HTTPException(400, f"unknown benchmark {req.benchmark!r}")
    session_id = os.urandom(4).hex()
    EXPLORES[session_id] = RunHandle(req.container_id)
    params = dict(
        goal=req.goal,
        benchmark=req.benchmark,
        constraints=req.constraints,
        max_iterations=req.max_iterations,
        container=req.container_id,
        store=STORE,
        memory=AGENT_MEMORY,
        start_config=(
            GPUConfig.from_dict(req.start_config.model_dump())
            if req.start_config else None
        ),
    )
    asyncio.create_task(_explore_job(session_id, params))
    return {"session_id": session_id}


@app.get("/explore/{session_id}/stream")
async def explore_stream(session_id: str):
    handle = EXPLORES.get(session_id)
    if handle is None:
        raise HTTPException(404, f"no exploration {session_id!r}")
    return _sse_response(handle)
