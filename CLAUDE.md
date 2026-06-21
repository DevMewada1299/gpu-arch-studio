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

## GPU Config Parameters (REAL — from our actual working config)

Baseline GPU: **GTX 480, Fermi, compute capability 2.0**. The benchmark runs
in ~8 seconds, so live simulation during the demo is viable (no fake demo mode
strictly required, though keep it as backup).

These are the ACTUAL tunable lines in our `gpgpusim.config`:

| UI param | config key | baseline | slider values |
|----------|-----------|----------|---------------|
| SM Clusters | `-gpgpu_n_clusters` | 15 | 8, 15, 30, 60 |
| Cores/cluster | `-gpgpu_n_cores_per_cluster` | 1 | 1, 2, 4 |
| Memory Controllers | `-gpgpu_n_mem` | 6 | 4, 6, 8, 12 |
| Shared Memory | `-gpgpu_shmem_size` | 49152 | 16384, 32768, 49152 |
| Warp Scheduler | `-gpgpu_scheduler` | gto | gto, lrr, two_level_active |
| Schedulers/core | `-gpgpu_num_sched_per_core` | 2 | 1, 2, 4 |
| L1 Cache (sets) | `-gpgpu_cache:dl1` | N:32:128:4 | edit SETS field: 16,32,64,128 |
| L2 Cache (sets) | `-gpgpu_cache:dl2` | S:64:128:8 | edit SETS field: 32,64,128 |

### IMPORTANT: cache lines are format strings, not single numbers
`-gpgpu_cache:dl1 N:32:128:4,L:L:m:N:H,S:64:8,8`
The format is `<sector>:<nsets>:<linesize>:<assoc>,...`. To change L1 SIZE,
edit the SETS field (the `32`). Total L1 size = nsets × linesize × assoc.
So 32:128:4 = 16KB. The config_generator must parse and rewrite ONLY that
field, preserving the rest of the string exactly. Same for L2 (`64` in dl2).

### IMPORTANT: changing SM Clusters or Memory Controllers needs the interconnect
The `config_fermi_islip.icnt` interconnect is a fixed-size crossbar:
`k = n_clusters + n_mem*2` (baseline 15 + 6*2 = 27). If you change
`-gpgpu_n_clusters` or `-gpgpu_n_mem` you MUST also rewrite the `.icnt`'s `k`
to match, or GPGPU-Sim segfaults at kernel launch. The config_generator emits
both files together (`generate_files()`); the runner writes both. The other 6
params (cores, shmem, scheduler, sched/core, L1, L2 sets) do not touch the
interconnect and are safe to vary alone.

## Stats To Parse From Simulation Output (REAL field names)

These are the EXACT strings in our output. Note: output gives MISS rates;
compute hit_rate = 1 - miss_rate.

| Field in output | Meaning | Example value |
|-----------------|---------|---------------|
| `gpu_tot_ipc` | overall IPC — HEADLINE metric | 274.8514 |
| `gpu_tot_sim_insn` | total instructions | 7569408 |
| `gpu_tot_sim_cycle` | total cycles | 27540 |
| `gpu_occupancy` | warp occupancy % | 29.7003% |
| `gpu_stall_dramfull` | DRAM stall cycles | 532 |
| `L1D_total_cache_miss_rate` | L1 data MISS rate (hit = 1-this) | 0.6151 |
| `L2_total_cache_miss_rate` | L2 MISS rate (hit = 1-this) | 0.4937 |
| `L1I_total_cache_miss_rate` | L1 instruction miss rate | 0.0302 |
| `L2_BW_total` | L2 bandwidth GB/Sec (aggregate; NOT per-partition `L2_BW`) | 82.2801 |
| `gpgpu_n_stall_shd_mem` | shared mem stalls | 160 |
| `gpgpu_simulation_time` | wall-clock | 8 sec |

Parser regex examples:
- `gpu_tot_ipc\s*=\s*([\d.]+)`
- `gpu_occupancy\s*=\s*([\d.]+)%`
- `L1D_total_cache_miss_rate\s*=\s*([\d.]+)`

## Benchmark

**DCT8x8 (JPEG)** — the discrete cosine transform kernels at the heart of JPEG
compression. Already compiled and working in the container at the JPEG dir.
Real, recognizable, runs in 8s. This is our primary benchmark.
Run command (from inside the JPEG dir where gpgpusim.config lives):
the executable auto-activates GPGPU-Sim, which reads gpgpusim.config from CWD.
Input image: cameraman.bmp. Final line on success: `SUCCESS`.

If time permits, add a second benchmark (vectoradd or similar) for contrast,
but DCT8x8 alone is enough for the demo.

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
     → all past experiments from Redis (light SimStats only)

GET  /experiments/{exp_id}            → one experiment (config + SimStats)
GET  /experiments/{exp_id}/details    → rich SimReport for the deep-dive view
     (per-SM L1D heatmap, cache/traffic breakdowns, warp distribution,
      latency histograms, DRAM bandwidth bottlenecks, instr mix, stalls)

POST /explore
     body: { benchmark: string, goal: string, constraints?: object, containers: string[] }
     → starts autonomous agentic exploration, returns { session_id }

GET  /explore/{session_id}/stream    (SSE)
     → streams: agent proposals, run results, reasoning, final recommendation
```

## Shared TypeScript / Python Types

> These match the REAL config params and parsed stat fields exactly. The
> backend `config_generator` params dict uses the same keys as `GPUConfig`.

```typescript
interface GPUConfig {
  n_clusters: number;          // -gpgpu_n_clusters            (8/15/30/60)
  cores_per_cluster: number;   // -gpgpu_n_cores_per_cluster   (1/2/4)
  n_mem: number;               // -gpgpu_n_mem                 (4/6/8/12)
  shmem_size: number;          // -gpgpu_shmem_size, BYTES     (16384/32768/49152)
  scheduler: "gto" | "lrr" | "two_level_active";
  num_sched_per_core: number;  // -gpgpu_num_sched_per_core    (1/2/4)
  l1_sets: number;             // SETS field of -gpgpu_cache:dl1 (16/32/64/128)
  l2_sets: number;             // SETS field of -gpgpu_cache:dl2 (32/64/128)
}
// NOTE: n_clusters / n_mem also require a matching interconnect file — the
// backend handles this automatically (see the interconnect note above).

interface SimStats {
  ipc: number;          // gpu_tot_ipc — headline metric
  total_insn: number;   // gpu_tot_sim_insn
  total_cycles: number; // gpu_tot_sim_cycle
  occupancy: number;    // gpu_occupancy, fraction 0-1 (raw output is %)
  l1_hit_rate: number;  // 1 - L1D_total_cache_miss_rate, fraction 0-1
  l2_hit_rate: number;  // 1 - L2_total_cache_miss_rate, fraction 0-1
  l1i_hit_rate: number; // 1 - L1I_total_cache_miss_rate, fraction 0-1
  dram_stalls: number;  // gpu_stall_dramfull
  shmem_stalls: number; // gpgpu_n_stall_shd_mem
  l2_bw: number;        // L2_BW, GB/s
  sim_time_sec: number; // gpgpu_simulation_time, wall-clock seconds
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
- [x] docker_manager can exec a sim from Python
- [x] config_generator templates configs (+ matching interconnect)
- [x] stats_parser extracts real fields from output
- [x] report_parser: rich SimReport (Nsight-style) for the deep-dive view
- [x] runner: GPUConfig -> run -> parsed Experiment (stored, Sentry on failure)
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
