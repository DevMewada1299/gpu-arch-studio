# GPU Architecture Studio

**Autonomous GPU microarchitecture design-space exploration.** You state a goal
in plain language ("maximize IPC for the JPEG workload"); a team of Claude
agents then *autonomously* proposes a GPU config, runs a real GPGPU-Sim
simulation, analyzes the bottleneck, proposes the next config, and converges on
a Pareto-optimal design — explaining every decision. No human config-editing,
and **no custom UI required** — the whole workflow is driven through an
ASI:One / Fetch.ai chat agent.

> "GPU architecture exploration used to take a PhD student weeks of manual
> config editing and cluster queueing. We built a system where AI agents do
> the exploration autonomously and explain every decision."

---

## How it works

```
ASI:One / Agentverse chat
        │  "find the best GPU config for JPEG"
        ▼
  Fetch.ai uAgent  ── HTTP ──►  FastAPI backend
  (chat protocol)                    │
                                     ▼   autonomous loop (explore)
        ┌──────────────────────────────────────────────────────────┐
        │  propose config → run REAL GPGPU-Sim → agents analyze →   │
        │  orchestrator reasons over full history → propose next →  │
        │  repeat until converged                                   │
        └──────────────────────────────────────────────────────────┘
             │              │                    │
       GPGPU-Sim       4 Claude agents      RedisVL agent memory
       (Docker)    (Memory/Warp/Bottleneck   (semantic recall of
                    + Orchestrator)           past experiments)
```

**The four agents** (Claude): a **Memory** agent (cache/bandwidth), a **Warp**
agent (occupancy/scheduling), a **Bottleneck** agent (roofline classification),
and an **Orchestrator** that reads the full experiment history and proposes the
next config like a senior architect.

## Sponsor integrations

- **Anthropic / Claude** — the agents are Claude (Haiku for the specialists,
  Sonnet for the orchestrator with adaptive thinking). Built with Claude Code.
- **Fetch.ai / ASI:One** — `backend/fetch_agents.py` is a uAgent implementing
  the Agent Chat Protocol, registered on Agentverse (Mailbox) and chattable
  from ASI:One. It runs as a separate process and drives the whole system.
- **Redis (beyond caching)** — RedisVL vector store as **agent memory**: each
  experiment is embedded (sentence-transformers) and the orchestrator
  *semantically recalls* relevant past experiments before proposing
  (`backend/agent_memory.py`). Redis Cloud also durably stores experiments.
- **Sentry** — reliability + observability: every simulation and agent call is
  a traced transaction tagged with the config/IPC; sim crashes and datastore
  blips are captured as issues with full context (`backend/monitoring.py`).

---

## Run it

### Prerequisites
- Docker with the GPGPU-Sim container running (the JPEG/DCT8x8 benchmark at
  `/tmp/benchmarks/JPEG`).
- Python 3.9+ for the backend.
- An `ANTHROPIC_API_KEY`. Optional: `REDIS_URL`, `SENTRY_DSN`.

### 1. Backend
```bash
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt

cp .env.example .env        # then fill in ANTHROPIC_API_KEY (+ optional REDIS_URL, SENTRY_DSN)

uvicorn backend.main:app --port 8000
```
- The app auto-loads `.env`. It uses Redis if `REDIS_URL` is reachable, else an
  in-memory store. Sentry activates if `SENTRY_DSN` is set.
- On a restricted network (Redis port blocked), start with
  `DISABLE_REDIS=1 uvicorn backend.main:app --port 8000` to force in-memory.

### Run without Docker (DEMO_MODE) — for frontend dev & fast demos
No GPGPU-Sim container? Run the **real API** with replayed simulator data:
```bash
DEMO_MODE=1 DISABLE_REDIS=1 uvicorn backend.main:app --port 8000
```
- Sims are **replayed** from captured real output (no Docker), with IPC that
  still responds to the config so exploration looks real.
- `DISABLE_REDIS=1` → in-memory store (no Redis needed).
- If `ANTHROPIC_API_KEY` is **unset**, the agents return canned (config-aware)
  analysis, so `/explore` runs **end-to-end with zero external dependencies**.
  Set the key to get live Claude reasoning instead.

Every endpoint behaves identically to production (same shapes, same SSE) — the
frontend can build and test against the real contract. Also the fast path for
judging (no waiting on real simulations).

### 2. Try the autonomous loop directly (no agent/UI needed)
```bash
# one experiment end-to-end
curl -X POST localhost:8000/experiments/run \
  -H 'Content-Type: application/json' \
  -d '{"config":{"n_clusters":15,"cores_per_cluster":1,"n_mem":6,"shmem_size":49152,"scheduler":"gto","num_sched_per_core":2,"l1_sets":32,"l2_sets":64},"benchmark":"dct8x8"}'

# full autonomous exploration, streamed (SSE)
curl -N -X POST localhost:8000/explore -H 'Content-Type: application/json' \
  -d '{"goal":"maximize IPC for the JPEG workload","constraints":{"max_n_clusters":30}}'
# → returns {session_id}; then: curl -N localhost:8000/explore/{session_id}/stream
```

### 3. Fetch.ai / ASI:One agent (separate environment)
uAgents needs Python ≥3.10, so run it in its own env so it never touches the
backend's dependencies:
```bash
conda create -n fetch python=3.11 -y && conda activate fetch
pip install uagents aiohttp
python backend/fetch_agents.py      # prints the agent address + Agentverse inspector URL
```
Then: log in at **agentverse.ai**, open the printed inspector URL → **Connect →
Mailbox** (allow the browser's Local Network Access prompt). The agent gets a
public profile and is chattable from **asi1.ai** — message it
*"Find the best GPU config for the JPEG workload"* and it runs a bounded
autonomous exploration and replies with the optimal config + reasoning.
(Keep the backend from step 1 running — the agent calls it over HTTP.)

---

## Test it

Pure tests (no Docker/API/keys — run with any Python):
```bash
python tests/config_generator/test_generate_config.py
python tests/stats_parser/test_parse_stats.py
python tests/report_parser/test_parse_report.py
python tests/agent_memory/test_agent_memory.py
python tests/explore/test_explore.py
```

Live tests (need the venv, the container, and keys):
```bash
python tests/docker_manager/test_run_benchmark.py     # real GPGPU-Sim run
python tests/runner/test_run_experiment.py            # config -> sim -> parsed Experiment
python tests/agent_engine/test_analyze.py             # Claude agents on real stats
python tests/explore/test_explore_live.py             # real autonomous loop (IPC climbs)
python tests/redis_store/test_redis_store.py          # Redis round-trip (needs REDIS_URL)
python tests/monitoring/test_sentry_smoke.py          # Sentry connectivity

# end-to-end over HTTP (start uvicorn first)
python tests/api/test_api_e2e.py                      # /containers,/run,/stream,/history,/details
python tests/api/test_explore_api.py                  # full /explore loop over SSE
```

## API

`GET /containers` · `POST /experiments/run` → `{exp_id}` ·
`GET /experiments/{id}/stream` (SSE) · `GET /experiments/history` ·
`GET /experiments/{id}/details` (rich Nsight-style report) ·
`POST /explore` + `GET /explore/{id}/stream` (autonomous loop SSE) ·
`POST /explore/run` (synchronous summary, used by the chat agent).
Full contract: `docs/API_FOR_FRONTEND.md`.

## Repo structure
```
backend/      docker_manager, config_generator, runner, stats_parser, report_parser,
              models, store, redis_store, agent_engine, agent_memory, explore,
              monitoring, main (FastAPI), fetch_agents (Fetch.ai uAgent)
agents/       the four agent prompts (Memory/Warp/Bottleneck/Orchestrator)
tests/        per-module tests (pure + live)
docs/         CLAUDE.md context, plans, API_FOR_FRONTEND.md, sample_report.json
```

Team/process docs: `CLAUDE.md`, `docs/MASTER_PLAN.md`, and the per-module plans.
