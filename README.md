# 🖥️ GPU Architecture Studio

**AI agents that autonomously design better GPUs — and explain every decision.**

Tell it a goal in plain English ("maximize IPC for the JPEG workload"). A team of
Claude agents then proposes a GPU configuration, runs a **real** cycle-accurate
simulation, diagnoses the bottleneck, proposes a better config, and repeats —
converging on a Pareto-optimal chip design while narrating its reasoning. Drive
it from a web studio, or **just chat with it** through ASI:One.

---

## The problem (and why it matters)

A modern accelerator isn't one design — it's a **huge space of choices**: how many
SM clusters, cores per cluster, cache sizes, the warp scheduler, memory channels,
shared-memory budget. The *right* combination depends entirely on the workload,
and the search space is thousands of configs.

Today, finding the best config for a workload looks like this: a hardware
specialist hand-edits a simulator config, queues a cycle-accurate job on a
cluster (each run is minutes to hours), squints at a 3,000-line dump of
performance counters, forms a hypothesis about the bottleneck, tweaks one
parameter, and repeats — for **days or weeks**. The expertise to read those
counters and know *what to change and why* lives in a handful of PhD-level heads.

**That's the bottleneck we attack.** GPU Architecture Studio puts that expert
loop on autopilot: AI agents decide what to try, run real simulations, read the
real counters, reason about the bottleneck like a senior architect, and converge
on an optimal design — explaining each step. It turns a weeks-long, specialist-only
process into a conversation anyone can have.

> This is **not** a UI that explains what *you* ran. The agents drive the loop —
> they choose the next experiment. That autonomy is the product.

**Who it helps:** hardware/architecture engineers (explore a design space in
minutes, with rationale attached), ML-systems & performance engineers (fit a chip
to a workload without learning the simulator), and researchers/students (a
transparent, teachable loop that *shows* why a design is compute- vs memory-bound).

---

## How it works

```
 ASI:One / Agentverse chat                Web Studio (React)
        │  "best GPU config for JPEG?"          │ sliders + live charts
        ▼                                        ▼
  Fetch.ai uAgents  ──────── HTTP ────────►  FastAPI backend
  (Agent Chat Protocol)                          │
                                                 ▼   autonomous loop
   ┌─────────────────────────────────────────────────────────────────┐
   │  Orchestrator proposes config → run REAL GPGPU-Sim → 3 specialist  │
   │  agents analyze the counters → Orchestrator reasons over the FULL  │
   │  history (+ vector-recalled past runs) → proposes next → repeat    │
   │  until converged on a Pareto-optimal design                        │
   └─────────────────────────────────────────────────────────────────┘
        │                    │                          │
   GPGPU-Sim            Claude agents             RedisVL agent memory
   (Docker, ~8s/run)    Memory · Warp ·           (semantic recall of
                        Bottleneck · Orchestrator   relevant past runs)
```

**The four agents** (Claude): **Memory** (cache/bandwidth/reuse), **Warp**
(occupancy/scheduling/latency-hiding), **Bottleneck** (synthesizes both into a
roofline classification + the highest-leverage change), and **Orchestrator**
(reads the full history, recalls relevant past experiments, proposes the next
config like a senior architect, finds the Pareto frontier).

A real run, verified: `IPC 315 → 459 → 490` as the agents scaled SM clusters then
tuned a second parameter — each step justified by the counters.

---

## 🏆 Sponsor integrations — the stories

### Anthropic / Claude — the reasoning
The agents *are* Claude, tiered for cost: **Haiku 4.5** for the three specialists
(fast, focused, run 3× per iteration) and **Sonnet 4.6** with adaptive thinking
for the Orchestrator (the hard, history-spanning reasoning). The result is
analysis a GPU architect would actually write — *"occupancy is 32% yet IPC is 315,
so this kernel is latency-tolerant; chasing occupancy won't pay"* — not generic
filler. One full 8-experiment exploration costs **~$0.25**. Built with Claude Code.

### Redis — *agent memory*, not caching
The Orchestrator is only as good as what it remembers. As exploration grows,
stuffing the entire history into the prompt is expensive and noisy. So we use
**RedisVL** as the agent's **long-term memory**: every experiment (config + stats
+ bottleneck classification) is embedded with a local sentence-transformer into a
**vector index**, and before each decision the Orchestrator **semantically recalls
the most relevant past experiments** — RAG over the agent's *own experience*. It
reasons like an architect who remembers *"we've been in a shared-memory-bound
regime like this before; here's what worked."*

**How it helped us:** it turned a context-window problem into a feature. The
Orchestrator gets sharper as it accumulates experience, recall works **across
sessions**, and Redis Cloud durably stores every experiment. This is Redis used
*beyond caching* — vector search + context retrieval + agent memory.

### Sentry — reliability for a system *you don't drive*
When the **AI** decides what to run, you can't eyeball whether it stayed healthy.
We instrument **every simulation and every agent call as a Sentry transaction**,
tagged with the config and resulting IPC — a live, queryable map of what the
autonomous loop did and where time/cost went. And AI-proposed configs *can break
the simulator*: scaling SM clusters without resizing the interconnect **segfaults
GPGPU-Sim**. Sentry captures those crashes **with the offending config attached**,
and the runner returns an error result instead of dying.

**How it helped us:** mid-build, a flaky Redis connection dropped during a run and
killed a successful experiment. Sentry surfaced it immediately — so we made
persistence best-effort (a datastore blip can never lose a run) and captured the
blip instead. We literally used Sentry to **find and fix a real reliability bug.**

### Fetch.ai / ASI:One — a product anyone can talk to
A research tool shouldn't need a custom UI to be useful. We wrapped the agents as
**Fetch.ai uAgents** implementing the **Agent Chat Protocol**, registered on
**Agentverse** and reachable from **ASI:One** — chat *"find the best GPU config
for JPEG"* and the autonomous system runs and answers. And it's a **true
multi-agent system**: an **Orchestrator uAgent delegates to Memory/Warp/Bottleneck
specialist uAgents over Fetch messaging**, then synthesizes their verdicts.

**How it helped us:** it turned a backend tool into a conversational product
reachable by anyone, and satisfied "complete the workflow with no custom frontend."

---

## 🚀 Build & run

### Prerequisites
Python 3.9+ (backend). Docker with the GPGPU-Sim container for *real* sims
(optional — see DEMO_MODE). `ANTHROPIC_API_KEY` for live agents; optional
`REDIS_URL`, `SENTRY_DSN`.

```bash
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env            # add ANTHROPIC_API_KEY (+ optional REDIS_URL, SENTRY_DSN)
uvicorn backend.main:app --port 8000
```
On startup it logs the store (`Redis`/in-memory) and Sentry (`enabled`/`disabled`).

### Run with NO Docker (DEMO_MODE — frontend dev & quick demos)
```bash
DEMO_MODE=1 DISABLE_REDIS=1 uvicorn backend.main:app --port 8000
```
Serves the **real API** with replayed simulator data — zero Docker/Redis. With
`ANTHROPIC_API_KEY` unset, agents return canned config-aware analysis so
`/explore` runs end-to-end offline; set the key for live Claude.

### Try the autonomous loop
```bash
curl -N -X POST localhost:8000/explore -H 'Content-Type: application/json' \
  -d '{"goal":"maximize IPC for the JPEG workload","constraints":{"max_n_clusters":30}}'
# → {session_id}; then: curl -N localhost:8000/explore/{session_id}/stream
```

### Test
```bash
python tests/explore/test_explore.py            # loop, parser, pareto (pure)
python tests/agent_memory/test_agent_memory.py  # vector recall (pure)
python tests/api/test_api_e2e.py                # full API over HTTP (uvicorn running)
python tests/api/test_explore_api.py            # autonomous /explore loop over SSE
```

---

## 💬 Fetch.ai / ASI:One — run & submit

uAgents needs Python ≥3.10 — keep it in its own env (off the backend's deps):
```bash
conda create -n fetch python=3.11 -y && conda activate fetch
pip install uagents aiohttp
```

**Single agent (primary):** `python backend/fetch_agents.py` — runs the full
autonomous exploration on a chat message.
**Multi-agent (bonus):** `python backend/fetch_bureau.py` — 4 uAgents; the
Orchestrator runs a real sim, then delegates analysis to the 3 specialists over
Fetch and synthesizes. (Verify locally first: `python tests/fetch/test_bureau_local.py`.)

**Submit (the two Devpost deliverables):**
1. Each agent prints an **Agentverse inspector URL** on startup. Log in at
   agentverse.ai, open it → **Connect → Mailbox** (allow Local Network Access) →
   you get a public **Agent Profile URL** for each agent.
2. On **asi1.ai**, find your Orchestrator agent and chat it — copy the **shared
   chat link**. Put both (profile URLs + chat link) + this repo on Devpost.
Keep the backend running — the agents call it over HTTP.

---

## 📸 Screenshots
_(UI in progress — drop in when ready)_ — the Studio (config + live dashboard +
agent panel), autonomous exploration (agents reasoning + IPC climbing), the
Nsight-style deep-dive (per-SM heatmap, traffic, DRAM bottlenecks), the ASI:One
chat, Agentverse profiles, Sentry traces, RedisVL recall.

## Tech stack
Claude (Haiku + Sonnet) · Fetch.ai uAgents + Chat Protocol + ASI:One · FastAPI +
SSE · GPGPU-Sim (GTX 480/Fermi) in Docker · RedisVL + sentence-transformers ·
Redis Cloud · Sentry · React + TypeScript + Tailwind + Recharts.

## Repo structure
```
backend/   docker_manager, config_generator, runner, stats_parser, report_parser,
           models, store, redis_store, agent_engine, agent_memory, explore,
           monitoring, main (FastAPI), fetch_agents + fetch_bureau (Fetch.ai)
agents/    the four agent prompts
tests/     per-module tests (pure + live)
docs/      API_FOR_FRONTEND.md (contract + integration notes), sample_report.json
```
Full API contract + frontend integration notes: **`docs/API_FOR_FRONTEND.md`**.
