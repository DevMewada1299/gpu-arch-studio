# 🖥️ GPU Architecture Studio

**AI agents that autonomously design better GPUs — and explain every decision.**

State a goal in plain English ("maximize IPC for the JPEG workload"). A team of
Claude agents then proposes a GPU configuration, runs a **real** cycle-accurate
simulation, diagnoses the bottleneck, proposes a better config, and repeats —
converging on a Pareto-optimal chip design while narrating its reasoning the
whole way. You can drive it from a web studio **or just chat with it** through
ASI:One.

---

## The problem

GPU microarchitecture exploration is slow, manual, and expert-only. Tuning a
chip for a workload means a specialist hand-editing simulator configs, queueing
jobs on a cluster, reading dense stat dumps, forming a hypothesis, and
repeating — for **weeks**. The knowledge of *what to change and why* lives in a
few PhD-level heads.

## What we built

An **agentic design-space exploration tool**. The agents — not a human — decide
what experiment to run next. They propose a config, run it on **GPGPU-Sim**
(real cycle-accurate simulation in Docker), read the real performance counters,
reason about the bottleneck like a senior architect, and converge toward an
optimal design. Every decision is explained in natural language.

> "GPU architecture exploration used to take a PhD student weeks of manual
> config editing and cluster queueing. We built a system where AI agents do the
> exploration autonomously and explain every decision — reachable from a chat."

**This is not a UI wrapper that explains what *you* ran.** The agents drive the
loop. That autonomy is the core of the product.

## Who it helps

- **Hardware engineers / architects** — explore a design space in minutes, with
  the rationale attached, instead of weeks of manual sweeps.
- **ML systems / performance engineers** — find the chip config that best fits a
  specific workload (e.g., JPEG/DCT) without learning the simulator internals.
- **Researchers & students** — a teachable, transparent loop that *shows* why a
  config is compute- vs memory-bound and what to change. It democratizes
  expertise that used to be locked in specialists' heads.

---

## How it works

```
 ASI:One / Agentverse chat                Web Studio (React)
        │  "best GPU config for JPEG?"          │ sliders + live charts
        ▼                                        ▼
  Fetch.ai uAgent  ───────── HTTP ──────►  FastAPI backend
  (Agent Chat Protocol)                         │
                                                ▼   autonomous loop
   ┌────────────────────────────────────────────────────────────────┐
   │  Orchestrator proposes config → run REAL GPGPU-Sim → 3 specialist │
   │  agents analyze the counters → Orchestrator reasons over the FULL │
   │  history (+ vector-recalled past runs) → proposes next → repeat   │
   │  until converged on a Pareto-optimal design                       │
   └────────────────────────────────────────────────────────────────┘
        │                    │                         │
   GPGPU-Sim            Claude agents            RedisVL agent memory
   (Docker, ~8s/run)    Memory · Warp ·          (semantic recall of
                        Bottleneck · Orchestrator  relevant past runs)
```

**The four agents** (Claude):
- **Memory Agent** — cache hit rates, DRAM stalls, bandwidth pressure; reasons
  about working-set fit and reuse.
- **Warp Agent** — occupancy, scheduler fit, warp stalls; reasons about latency
  hiding.
- **Bottleneck Agent** — synthesizes both into a roofline classification
  (compute- / latency- / bandwidth-bound) and the highest-leverage change.
- **Orchestrator** — reads the full experiment history, semantically recalls
  relevant past experiments, and proposes the next config like a senior
  architect; identifies the Pareto frontier and convergence.

---

## 🏆 Sponsor integrations

**Anthropic / Claude** — the agents *are* Claude, tiered for cost: **Haiku 4.5**
for the three specialists (fast, focused), **Sonnet 4.6** with adaptive thinking
for the Orchestrator (the hard reasoning). One full 8-experiment exploration
costs ~$0.25. Built with Claude Code.

**Fetch.ai / ASI:One** — `backend/fetch_agents.py` is a **uAgent implementing
the Agent Chat Protocol**, registered on **Agentverse** (Mailbox) and
discoverable + chattable from **ASI:One**. Chat it a goal in natural language
and it drives the entire autonomous exploration and replies with the optimal
config + reasoning. It runs as a separate process and calls the backend over
HTTP — meaningful agent-to-agent orchestration + real tool execution
(GPGPU-Sim), with no custom frontend required to complete the workflow.

**Redis — *beyond caching*** — RedisVL as **agent memory**: every experiment is
embedded (local sentence-transformers) into a **vector index**, and the
Orchestrator **semantically recalls** the most relevant past experiments before
each proposal — vector search + context retrieval + agent memory, not key-value
caching. Redis Cloud also durably stores the experiment history
(`backend/agent_memory.py`, `backend/redis_store.py`).

**Sentry — reliability & observability for an autonomous system** — since the
*AI* drives the loop, you need to know it stays reliable. Every simulation and
agent call is a **traced transaction tagged with the config + resulting IPC**;
sim crashes (an AI-proposed config that breaks the simulator) and datastore
blips are **captured as issues with full context**, and runs **degrade
gracefully** instead of dying (`backend/monitoring.py`). We actually used Sentry
to catch and fix a real reliability bug during the build.

---

## 🚀 Build & run

### Prerequisites
- Python 3.9+ (backend). Docker with the GPGPU-Sim container for *real* sims
  (optional — see DEMO_MODE).
- `ANTHROPIC_API_KEY` for live agents (optional in demo mode). Optional:
  `REDIS_URL`, `SENTRY_DSN`.

### Backend
```bash
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env            # fill ANTHROPIC_API_KEY (+ optional REDIS_URL, SENTRY_DSN)
uvicorn backend.main:app --port 8000
```

### Run with NO Docker (DEMO_MODE — for the frontend & quick demos)
Serves the **real API** with replayed simulator data — zero Docker/Redis/key:
```bash
DEMO_MODE=1 DISABLE_REDIS=1 uvicorn backend.main:app --port 8000
```
With `ANTHROPIC_API_KEY` unset, the agents return canned config-aware analysis
so `/explore` runs end-to-end offline; set the key for live Claude reasoning.

### 💬 Chat with the agent (Fetch.ai / ASI:One)
uAgents needs Python ≥3.10 — run it in its own env (keeps deps off the backend):
```bash
conda create -n fetch python=3.11 -y && conda activate fetch
pip install uagents aiohttp
python backend/fetch_agents.py     # prints the agent address + Agentverse inspector URL
```
1. Log in at **agentverse.ai**, open the printed inspector URL → **Connect →
   Mailbox** (allow the browser's Local Network Access prompt). → public profile.
2. On **asi1.ai**, find the agent and message it
   *"Find the best GPU config for the JPEG workload."* It runs a bounded
   autonomous exploration and replies with the best config + reasoning.
   (Keep the backend running — the agent calls it over HTTP.)

### Try the API directly
```bash
# autonomous exploration, streamed (SSE)
curl -N -X POST localhost:8000/explore -H 'Content-Type: application/json' \
  -d '{"goal":"maximize IPC for the JPEG workload","constraints":{"max_n_clusters":30}}'
# → {session_id}; then: curl -N localhost:8000/explore/{session_id}/stream
```

### Test
```bash
# pure (no Docker/keys)
python tests/explore/test_explore.py
python tests/agent_memory/test_agent_memory.py
python tests/report_parser/test_parse_report.py
# end-to-end over HTTP (start uvicorn first)
python tests/api/test_api_e2e.py
python tests/api/test_explore_api.py
```

---

## 📸 Screenshots

_(UI in progress — add when ready)_

- **The Studio** — config panel, live performance dashboard, agent panel. `![studio](docs/screenshots/studio.png)`
- **Autonomous exploration** — agents reasoning + IPC climbing per iteration. `![explore](docs/screenshots/explore.png)`
- **Deep-dive (Nsight-style)** — per-SM heatmap, memory traffic, DRAM bottlenecks. `![details](docs/screenshots/details.png)`
- **ASI:One chat** — chatting the agent to run an exploration. `![asi1](docs/screenshots/asi1-chat.png)`
- **Agentverse profile** + **Sentry traces** + **RedisVL recall**.

---

## Tech stack

| Layer | Tech |
|---|---|
| Agents | Claude (Haiku + Sonnet) via the Anthropic SDK |
| Agent comms | Fetch.ai uAgents + Agent Chat Protocol, ASI:One |
| Backend | Python · FastAPI · SSE |
| Simulation | GPGPU-Sim (GTX 480 / Fermi) in Docker |
| Agent memory | RedisVL vector index + sentence-transformers |
| Storage | Redis Cloud (experiments) |
| Monitoring | Sentry (traces + reliability) |
| Frontend | React + TypeScript + Tailwind + Recharts |

## Repo structure
```
backend/   docker_manager, config_generator, runner, stats_parser, report_parser,
           models, store, redis_store, agent_engine, agent_memory, explore,
           monitoring, main (FastAPI), fetch_agents (Fetch.ai uAgent)
agents/    the four agent prompts (Memory/Warp/Bottleneck/Orchestrator)
tests/     per-module tests (pure + live)
docs/      API_FOR_FRONTEND.md (contract + integration notes), sample_report.json,
           CLAUDE.md (project context), module plans
```

## API (summary)
`GET /health` · `GET /containers` · `POST /experiments/run` →`{exp_id}` ·
`GET /experiments/{id}/stream` (SSE) · `GET /experiments/history` ·
`GET /experiments/{id}/details` (rich report) · `POST /explore` +
`GET /explore/{id}/stream` (autonomous loop SSE) · `POST /explore/run` (sync).
Full contract + frontend integration notes: **`docs/API_FOR_FRONTEND.md`**.
