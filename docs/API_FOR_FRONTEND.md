# Frontend ↔ Backend API Reference

> What the React app calls. Backend runs at **http://localhost:8000**
> (CORS allows http://localhost:3000). This is the source of truth for the
> data contract — design the UI around these shapes.

## Heads-up: what changed from the original plan

- **`GPUConfig` and `SimStats` field names are FINALIZED** (they match the real
  simulator now — the old `l1_size_kb`/`l2_size_mb`/`rrws` placeholders are gone).
- **New: a rich `SimReport`** (`GET /experiments/{id}/details`) powers an
  Nsight-style deep-dive view — per-SM heatmap, traffic flow, warp/stall
  breakdowns, latency histograms, DRAM bottlenecks.
- **Benchmark is `dct8x8`** (JPEG), not GEMM/vectoradd.
- **`POST /explore` is LIVE** — the autonomous loop (agents + orchestrator)
  streams over SSE. See the Autonomous Exploration section below.

---

## Types

```ts
interface GPUConfig {
  n_clusters: number;          // 8 | 15 | 30 | 60
  cores_per_cluster: number;   // 1 | 2 | 4
  n_mem: number;               // 4 | 6 | 8 | 12
  shmem_size: number;          // bytes: 16384 | 32768 | 49152
  scheduler: "gto" | "lrr" | "two_level_active";
  num_sched_per_core: number;  // 1 | 2 | 4
  l1_sets: number;             // 16 | 32 | 64 | 128
  l2_sets: number;             // 32 | 64 | 128
}

interface SimStats {           // the HEADLINE tier (dashboard + history)
  ipc: number;                 // gpu_tot_ipc
  total_insn: number;
  total_cycles: number;
  occupancy: number;           // fraction 0-1
  l1_hit_rate: number;         // 0-1
  l2_hit_rate: number;         // 0-1
  l1i_hit_rate: number;        // 0-1
  dram_stalls: number;
  shmem_stalls: number;
  l2_bw: number;               // GB/s
  sim_time_sec: number;
}

interface Experiment {
  exp_id: string;
  config: GPUConfig;
  stats: SimStats;
  benchmark: string;
  container_id: string;
  timestamp: number;
  status: "success" | "error";
  error: string | null;
  log_path: string | null;
}
```

## Endpoints

| Method & path | Body | Returns |
|---|---|---|
| `GET /health` | — | `{ ok: true, benchmarks: string[] }` |
| `GET /containers` | — | `[{ id, name, image, status, busy }]` |
| `POST /experiments/run` | `{ config: GPUConfig, benchmark, container_id? }` | `{ exp_id }` |
| `GET /experiments/{id}/stream` | — (SSE) | event stream, see below |
| `GET /experiments/history` | — | `Experiment[]` (light, no SimReport) |
| `GET /experiments/{id}` | — | `Experiment` |
| `GET /experiments/{id}/details` | — | `SimReport` (rich, see below) |
| `POST /explore` | `{ goal, benchmark?, constraints?, max_iterations?, start_config?, container_id? }` | `{ session_id }` |
| `GET /explore/{session_id}/stream` | — (SSE) | autonomous-loop event stream, see below |

### Run flow
1. `POST /experiments/run` → get `exp_id`.
2. Open `EventSource("/experiments/{exp_id}/stream")`.
3. Consume SSE events (each is `data: <json>`):
   - `{ "type": "output", "line": "..." }` — a line of sim output (stream live)
   - `{ "type": "complete", "exp_id, status, error, config, stats" }` — done
   - `{ "type": "error", "message": "..." }` — run failed to start
4. `GET /experiments/{id}/details` when the user opens the deep-dive.

## SimReport (the deep-dive / Nsight-style data)

`GET /experiments/{id}/details` returns:

```ts
interface SimReport {
  kernels: { name, launch_uid, cycles, insn, ipc, occupancy }[];   // per-kernel bars
  per_sm_l1d: { core, accesses, misses, miss_rate, reservation_fails }[]; // 15-SM heatmap
  cache_by_type: { [access_type: string]: { hit, miss } };         // stacked bar
  traffic_coretomem: { [access_type: string]: number };            // bytes — flow viz
  traffic_memtocore: { [access_type: string]: number };
  warp: { stall, idle, scoreboard, issued, single_issue, dual_issue }; // warp-state breakdown
  latency: {                                                         // distribution curves
    max_mf, avg_mf, max_icnt2mem, max_mrq, max_icnt2sh, ...,
    mf_lat_table: number[], mrq_lat_table: number[],
    icnt2mem_lat_table: number[], icnt2sh_lat_table: number[]
  };
  dram: {                                                            // DRAM bandwidth panel
    row_buffer_locality, bank_level_parallelism, bw_util, dram_eff,
    bottlenecks: { rcd, rcdwr, wtr, rtw, ccdl }                      // why BW is wasted
  };
  instr_mix: { load, store, shmem, const_mem, param_mem, tex, ... }; // workload character
  stalls: { gl_mem_resource, gl_mem_coal, gl_mem_data_port, icnt2sh, ... };
}
```

Real example values (baseline DCT8x8): `warp.scoreboard ≈ 995192` (dominant),
`dram.bottlenecks.ccdl ≈ 78524`, `instr_mix.shmem ≈ 1572864`, 15 entries in
`per_sm_l1d`. Great material for: per-SM heatmap, warp-state donut, DRAM
bottleneck bars, memory-traffic Sankey/flow, latency histograms.

## Run the backend locally (for integration)

```bash
cd <repo>
python -m venv venv && source venv/bin/activate    # if you don't have one
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```
- Needs Docker running with the GPGPU-Sim container (`relaxed_shaw`). Without
  it, `/containers` is empty and runs fail — but you can still develop the UI
  against mocks (below) and the static endpoints.
- Quick check: open http://localhost:8000/health.

## Sample payloads for mocking

- **`docs/sample_report.json`** — a REAL `SimReport` (from a baseline DCT8x8
  run). Drop it straight into your mocks to build the deep-dive view.
- Sample `Experiment` (history row / run-complete):

```json
{
  "exp_id": "89aeccd4",
  "config": { "n_clusters": 15, "cores_per_cluster": 1, "n_mem": 6,
              "shmem_size": 49152, "scheduler": "gto",
              "num_sched_per_core": 2, "l1_sets": 32, "l2_sets": 64 },
  "stats": { "ipc": 315.2309, "total_insn": 18710528, "total_cycles": 59355,
             "occupancy": 0.3241, "l1_hit_rate": 0.4583, "l2_hit_rate": 0.699,
             "l1i_hit_rate": 0.9839, "dram_stalls": 876, "shmem_stalls": 49638,
             "l2_bw": 82.2801, "sim_time_sec": 21 },
  "benchmark": "dct8x8", "container_id": "relaxed_shaw",
  "timestamp": 1718900000.0, "status": "success", "error": null,
  "log_path": "experiments/89aeccd4/output.log"
}
```

## Autonomous Exploration (the agent panel)

`POST /explore` starts the autonomous loop and returns `{ session_id }`. Open
`EventSource("/explore/{session_id}/stream")` and render these `data:` events
(each is one JSON object with a `type`):

```ts
// one iteration of: propose -> run sim -> agents analyze -> orchestrator proposes
{ type: "iteration_start", iteration: number, config: GPUConfig }
{ type: "experiment", iteration, exp_id, status, config: GPUConfig, stats: SimStats, error }
{ type: "analysis", iteration, agents: {
    memory:    { agent, text, status: "green"|"amber"|"red" },
    warp:      { agent, text, status },
    bottleneck:{ agent, text, status }      // status drives the card color
  } }
{ type: "proposal", iteration, reasoning: string, next_config: GPUConfig|null,
  converged: boolean, best_exp_id, best_reason }
{ type: "converged", best_exp_id, pareto: string[], iterations: number }  // final
{ type: "note" | "error", message }
```

UI mapping: stream each agent's `text` into its card (typewriter), color by
`status`; show the orchestrator's `reasoning` + proposed `next_config`; plot IPC
per `experiment`; highlight `pareto` exp_ids and `best_exp_id` at the end. Each
`experiment.exp_id` also has a full `SimReport` at `/experiments/{id}/details`
for the deep-dive.

## Notes
- All `SimStats` rates are fractions (0-1) — multiply by 100 for `%` display.
