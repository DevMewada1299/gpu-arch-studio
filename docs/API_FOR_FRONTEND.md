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

---

# Integration Notes & Gotchas (read before building)

Practical guidance so the UI fits the real backend. If you're using an AI
assistant to build the frontend, point it at this section.

### 1. Use the REAL field names + value ranges (most common mistake)
- `GPUConfig` is the 8 fields above (`n_clusters`, `cores_per_cluster`, `n_mem`,
  `shmem_size`, `scheduler`, `num_sched_per_core`, `l1_sets`, `l2_sets`).
  There is **no** `l1_size_kb`/`l2_size_mb`/`shmem_kb`, and scheduler is
  `gto|lrr|two_level_active` (**not** `rrws`).
- **Scale charts for real magnitudes:** `ipc` is in the **hundreds (~300–490)**,
  `occupancy` ~**0.30**, hit rates ~**0.4–0.7**. (Don't design around the old
  placeholder IPC of 1.4 — everything will look wrong.)
- All rates are fractions 0–1 → `×100` for `%`.

### 2. Config controls are discrete, not continuous
Sliders/segmented controls must snap to the allowed values only:
`n_clusters` 8/15/30/60 · `cores_per_cluster` 1/2/4 · `n_mem` 4/6/8/12 ·
`shmem_size` 16384/32768/49152 · `num_sched_per_core` 1/2/4 ·
`l1_sets` 16/32/64/128 · `l2_sets` 32/64/128 · `scheduler` gto/lrr/two_level_active.

**Benchmark is dynamic — do NOT hardcode `dct8x8`.** Populate the benchmark
selector from `GET /health` → `benchmarks` (array) and send the chosen value in
the request body of `/experiments/run` and `/explore`. Today the list is
`["dct8x8"]`; when the backend registers more, the UI picks them up with no
frontend change.

### 3. Two separate flows — build both
- **Manual run:** ConfigPanel → `POST /experiments/run` → open
  `EventSource('/experiments/{exp_id}/stream')` → render output + final stats.
- **Autonomous exploration (headline):** goal text → `POST /explore` →
  `EventSource('/explore/{session_id}/stream')` → drive the agent panel.

### 4. Consuming SSE
Use `EventSource`. Each message is a line `data: <json>`. Parse the JSON, switch
on `.type`. The stream stays open until `complete` (runs) / `converged`
(explore); buffered, so a late subscriber still gets all prior events. Handle
`error` and `note` event types too.

### 5. Agent reasoning is a COMPLETE block per event — animate client-side
The `analysis` event delivers each agent's full `text` at once (not token by
token). For a typewriter effect, **animate it on the client** — don't expect a
per-token stream. Color each agent card by `agents.<name>.status`
(`green|amber|red`).

### 6. Don't miss the `recall` event
Between `analysis` and `proposal` you may get
`{ type:"recall", recalled:[{exp_id,text,score}] }` — the orchestrator's
RedisVL semantic memory of similar past experiments. Nice UI moment:
"recalled N relevant prior runs."

### 7. `converged` is the finale
`{ type:"converged", best_exp_id, pareto:[exp_id...], iterations }` — highlight
`best_exp_id` and mark the `pareto` exp_ids on the IPC chart (Pareto frontier).

### 8. Two data tiers — don't over-fetch
History/table → light `SimStats` only. Fetch the heavy `SimReport`
(`/experiments/{id}/details`) **only** when opening one experiment's deep-dive
(the Nsight-style view). Mock it with `docs/sample_report.json`.

### 9. Timing / loading states
One simulation ≈ 8–20s; a full `/explore` ≈ minutes (several real sims). Design
explicit streaming/loading states. For the live demo, coordinate on a
pre-run/replay ("demo mode") so judges aren't waiting minutes.

### 10. Experiments can fail
`Experiment.status` is `"success"|"error"` (a config can fail the simulator).
Render error runs gracefully (e.g., greyed row + the `error` string).

### 11. CORS
Backend allows `http://localhost:3000` and `127.0.0.1:3000`. On a different
port, ask backend to add it.

### 12. Run the backend without Docker (DEMO_MODE) — your test setup
You don't have the GPGPU-Sim container, so run the backend in demo mode — it
serves the **real API with the real shapes**, replaying captured sim data:
```bash
pip install -r backend/requirements.txt
DEMO_MODE=1 DISABLE_REDIS=1 uvicorn backend.main:app --port 8000
```
- No Docker, no Redis needed. If `ANTHROPIC_API_KEY` is unset, agents return
  canned (config-aware) analysis so `/explore` works fully offline; set the key
  for live reasoning.
- Sims are replayed but IPC responds to the config, so the exploration loop and
  charts look real. Every endpoint (including SSE) behaves like production.
- Then point the frontend at `http://localhost:8000`.

### Build checklist
- [ ] ConfigPanel emits a valid `GPUConfig` (discrete values, real scheduler enum)
- [ ] Dashboard scales to real IPC/occupancy ranges; rates ×100 for %
- [ ] Manual run via `/experiments/run` + `/stream`
- [ ] Agent panel via `/explore` + `/stream`; cards colored by status; client-side typewriter
- [ ] `recall`, `converged` (best + pareto), `error`/`note` handled
- [ ] Deep-dive via `/experiments/{id}/details` (mock from sample_report.json)
- [ ] Loading/streaming states for multi-second/minute operations
