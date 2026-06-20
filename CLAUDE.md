# GPU Architecture Studio

> Shared context for the whole team. Claude Code reads this automatically.
> Keep the "What's Working" section updated as you build.

## What This Is

An **agentic GPU microarchitecture design space exploration tool**.

GPGPU-Sim runs inside Docker containers. Claude agents autonomously run
simulation experiments, analyze the performance results, and propose better
GPU configurations. The user watches the agents iterate toward an optimal
design for a given workload — and can intervene, add constraints, or override.

**The core differentiator:** this is NOT a UI wrapper that explains what the
user ran. The agents decide what to run next. They propose a config, run it,
read the results, reason about the bottleneck, and propose the next config —
converging on a Pareto-optimal design across experiments.

## The One-Sentence Pitch

"GPU architecture exploration used to take a PhD student weeks of manual
config editing and cluster queueing. We built an interface where AI agents
do the exploration autonomously and explain every decision."

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Tailwind + Recharts |
| Backend | Python FastAPI |
| Simulation | GPGPU-Sim inside Docker (already set up) |
| Docker control | docker-py (Python Docker SDK) |
| Agents | Anthropic Claude API (streaming) |
| Storage | Redis (experiment results + agent memory) |
| Delivery | Web app — open in browser at localhost:3000 |

> NOTE: We are using the WEB version (browser), not Electron. Backend runs
> on localhost:8000, frontend on localhost:3000. Simpler, faster to build.

## Tracks We're Targeting

- **Primary:** Ddoski's Lab Track (hardware, engineering, scientific tools)
- **Anthropic prize:** built with Claude Code, tackles a meaningful technical problem
- **Sponsor prizes:** Redis (experiment store + agent memory), Sentry
  (simulation run reliability monitoring), The Token Company (depth of research)

## Docker Setup Conventions

- GPGPU-Sim containers are labeled: `gpgpu-sim=true`
- Shared volume: `./experiments` on host → `/experiments` inside each container
- Each experiment writes config to `/experiments/{exp_id}/gpgpusim.config`
- Simulation output goes to `/experiments/{exp_id}/output.log`
- Container discovery: list running containers filtered by the label
- Multiple containers = parallel experiments (one experiment per container)

## GPU Config Parameters

These map directly to real `gpgpusim.config` entries.

| UI param | config key | values |
|----------|-----------|--------|
| SM Clusters | `-gpgpu_n_clusters` | 14, 28, 56, 84 |
| Cores/cluster | `-gpgpu_n_cores_per_cluster` | 1, 2, 4 |
| L1 Data Cache | `-gpgpu_cache:dl1` | 16KB, 32KB, 48KB, 64KB, 128KB |
| L2 Cache | `-gpgpu_cache:dl2` | 2MB, 4MB, 8MB, 16MB |
| Warp Scheduler | `-gpgpu_scheduler` | gto, lrr, rrws |
| DRAM Channels | `-gpgpu_n_mem` | 4, 8, 12, 16 |
| Shared Memory | `-gpgpu_shmem_size` | 16KB, 32KB, 48KB, 64KB |

## Stats To Parse From Simulation Output

| Field | Meaning |
|-------|---------|
| `gpu_tot_ipc` | overall IPC — the headline metric |
| `L1D_total_cache_hit_rate` | L1 data cache hit rate (0.0–1.0) |
| `L2_total_cache_hit_rate` | L2 cache hit rate |
| `gpu_stall_dramfull` | DRAM stall cycles (memory pressure indicator) |
| `gpu_occupancy` | warp occupancy % |
| `gpu_tot_sim_insn` | total instructions simulated |
| `gpgpu_simulation_time` | wall-clock sim time |

## Benchmarks (pick 3–4, keep them small)

- **GEMM** — matrix multiply, represents AI workloads, memory-bound at scale
- **Vectoradd** — trivial, fast, good for testing the pipeline
- **BFS** — graph traversal, irregular memory access
- **Reduction** — tests shared memory and warp efficiency

## The Four Agents

1. **Memory Agent** — reads cache hit rates, DRAM stalls, bandwidth pressure.
   Reasons about working set size and data reuse.
2. **Warp Agent** — reads occupancy, scheduler efficiency, warp stalls.
   Reasons about why a scheduler policy suits the workload's access pattern.
3. **Bottleneck Agent** — synthesizes both. Classifies the workload as
   compute-bound / memory-latency-bound / memory-bandwidth-bound via roofline.
4. **Orchestrator** — reads all agent outputs + full experiment history,
   proposes the next config to try, identifies the Pareto frontier.

## Module Ownership

| Person | Module | Files |
|--------|--------|-------|
| Person 1 | Backend / Docker | `docker_manager.py`, `config_generator.py`, `stats_parser.py`, `experiment_manager.py` |
| Person 2 | Frontend | all of `frontend/src/` |
| Person 3 | Agents | `agent_engine.py`, `agents/*.md`, the autonomous loop |
| Person 4 (if 4) | Integration + polish + Redis + Sentry + demo | `redis_store.py`, glue, testing |

## API Contract (FastAPI)

```
GET  /containers
     → list available Docker containers with busy/idle status

POST /experiments/run
     body: { config: GPUConfig, benchmark: string, container_id?: string }
     → starts a run, returns { exp_id }

GET  /experiments/{exp_id}/stream    (SSE)
     → streams: {type:"output", line} ... {type:"complete", stats}

GET  /experiments/history
     → all past experiments from Redis

POST /explore
     body: { benchmark: string, goal: string, constraints?: object, containers: string[] }
     → starts autonomous agentic exploration, returns { session_id }

GET  /explore/{session_id}/stream    (SSE)
     → streams: agent proposals, run results, reasoning, final recommendation
```

## Shared TypeScript / Python Types

```typescript
interface GPUConfig {
  n_clusters: number;
  cores_per_cluster: number;
  l1_size_kb: number;
  l2_size_mb: number;
  scheduler: "gto" | "lrr" | "rrws";
  n_mem: number;
  shmem_kb: number;
}

interface SimStats {
  ipc: number;
  l1_hit_rate: number;
  l2_hit_rate: number;
  dram_stalls: number;
  occupancy: number;
  total_insn: number;
}

interface Experiment {
  exp_id: string;
  config: GPUConfig;
  stats: SimStats;
  benchmark: string;
  container_id: string;
  timestamp: number;
}
```

## Environment Variables

```
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://localhost:6379
GPGPU_SIM_IMAGE=<your image name>
```

## Demo Mode (CRITICAL for the live demo)

Live simulations take 30s+ each. The autonomous loop running 8 experiments
takes minutes — judges won't wait. Build a `DEMO_MODE` flag:
- Pre-run the key experiments before presenting, store results in Redis
- In demo mode, the loop replays stored results with realistic timing
- The agent reasoning is still live (Claude analyzing real stored stats)
- Always have a pre-recorded backup video as final insurance

## What's Working (update this as you go)

- [x] GPGPU-Sim runs in Docker on Mac
- [ ] docker_manager can exec a sim from Python
- [ ] stats_parser extracts real fields from output
- [ ] FastAPI /experiments/run works end to end
- [ ] Frontend config panel sends runs
- [ ] SSE streaming live output to UI
- [ ] Agents analyze real stats
- [ ] Autonomous exploration loop
- [ ] Multi-container parallel runs
- [ ] Demo mode + backup video

## Rules For Working With Claude Code

1. Build ONE module at a time. Don't ask it to build everything at once.
2. Always test against REAL GPGPU-Sim output before moving on. Never assume
   the output format — paste real output to Claude Code and have it adjust.
3. After each module works, update the "What's Working" checklist above.
4. Commit after every working piece. Small commits, frequent pushes.
5. The backend Docker pipeline is the highest-risk part — build and test it
   FIRST, before any frontend work depends on it.
