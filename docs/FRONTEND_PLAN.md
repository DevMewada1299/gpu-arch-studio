# Frontend Build Plan — Person 2 (React UI)

> You own what the judges actually see. ChipChat won partly because it looked
> clean and polished. A functional-but-ugly dashboard loses. Budget time for
> making it look genuinely good, not just work.

## Your Goal

A dark-themed "studio" interface with: a config panel (sliders/dropdowns),
a live performance dashboard (charts), an agent panel (streaming reasoning),
an experiment history table with comparison, and a container selector.

## Setup

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install recharts lucide-react
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Use Tailwind. Dark theme. Reference the frontend-design principles: pick a
real visual direction, not default Bootstrap-looking components.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  GPU Architecture Studio          [Containers: 2▼] [▶ RUN]   │
├──────────────┬──────────────────────┬───────────────────────┤
│ CONFIG PANEL │  PERFORMANCE          │  AGENT PANEL          │
│              │  DASHBOARD            │                       │
│ (sliders +   │  (live charts)        │  (streaming agent     │
│  dropdowns)  │                       │   reasoning)          │
│              │                       │                       │
├──────────────┴──────────────────────┴───────────────────────┤
│  EXPERIMENT HISTORY  (table, click two rows to compare)       │
└──────────────────────────────────────────────────────────────┘
```

## Build Order

### Step 1 — Scaffold + theme (1 hr)
Three-column layout, dark theme, header bar. Get the shell looking right
before filling it. Use a real color palette — deep charcoal background,
one accent color, good typography. Not gray-on-gray default.

### Step 2 — ConfigPanel (2 hrs)
- A slider or segmented control per parameter in CLAUDE.md
- Use the discrete allowed values (not continuous sliders — these are
  enumerated options). The 8 real params and their allowed values are in
  CLAUDE.md's config table, e.g. L1 sets = 16/32/64/128, scheduler =
  gto/lrr/two_level_active.
- A benchmark dropdown — for now just **DCT8x8 (JPEG)**, our only working
  benchmark (a second one is optional/stretch). The earlier GEMM/vectoradd/BFS
  list was a placeholder.
- Reads/writes a `GPUConfig` object (type in CLAUDE.md — the REAL params:
  n_clusters, cores_per_cluster, n_mem, shmem_size, scheduler,
  num_sched_per_core, l1_sets, l2_sets)
- The RUN button calls `POST /experiments/run`

Build with MOCK data first — hardcode a config, log it on RUN. Don't wait
for the backend.

### Step 3 — PerformanceDashboard (2.5 hrs)
The visual centerpiece. Use Recharts.
- Big IPC number (the headline metric) with a delta vs previous run
- A bar/gauge for L1 hit, L2 hit, occupancy, DRAM utilization
- A "memory hierarchy" stacked visualization (L1/L2/DRAM traffic)
- An IPC-over-experiments line chart (shows progress as agents iterate)

Build with MOCK SimStats first. Make it look great with fake data, then
wire real data in.

### Step 4 — AgentPanel (2 hrs)
- A card per agent (Memory, Warp, Bottleneck, Orchestrator)
- Each card streams text as the agent reasons (typewriter effect is nice)
- Color-code by status (green = healthy, amber = caution, red = bottleneck)
- The Orchestrator card shows the proposed next config

Consume the SSE stream from `/explore/{session}/stream`.

### Step 5 — ExperimentHistory + Compare (2.5 hrs)
- A table: each row is a past run (config summary + key stats)
- Click two rows → side-by-side comparison view
- The comparison is the DEMO KILLER: two configs, bars side by side,
  agent explaining the delta. Make this look impressive.

### Step 6 — ContainerSelector (1 hr)
- Dropdown/multiselect of available containers from `GET /containers`
- Show busy/idle status per container
- Let user pick how many containers to use for parallel exploration
- This is the "more powerful machines use more containers" feature

## Claude Code Prompts

Start Claude Code in `/frontend`:

```
1. "Read ../CLAUDE.md. Scaffold a Vite + React + TS + Tailwind app with a
   three-column dark-themed layout: config panel left, dashboard center,
   agent panel right, history table across the bottom. Header with a run
   button and container selector. Just the shell, styled well, no logic yet."

2. "Build ConfigPanel.tsx. One control per GPU param in CLAUDE.md using the
   discrete allowed values as segmented buttons. A benchmark dropdown.
   Emits a GPUConfig object. RUN button calls onRun(config)."

3. "Build PerformanceDashboard.tsx with Recharts. Props: a SimStats object
   and an array of past stats. Show a big IPC number with delta, gauges for
   hit rates and occupancy, and an IPC-over-time line chart. Use mock data
   in a default prop so it renders standalone."

4. "Build AgentPanel.tsx. Four agent cards that consume an SSE stream and
   display streaming text with a typewriter effect, color-coded by status."

5. "Build ExperimentHistory.tsx — a table of past runs. Clicking two rows
   opens a side-by-side comparison with bar charts of the key stats."

6. "Build ContainerSelector.tsx — multiselect of containers from
   GET /containers showing busy/idle, lets user choose how many to use."
```

## Mock Data To Develop Against

Put this in `src/mocks.ts` so you can build the whole UI before the backend
is ready. These use the REAL GPUConfig / SimStats fields (see CLAUDE.md) and
realistic JPEG numbers (baseline IPC ~315, 30-cluster ~457 — measured):

```typescript
export const mockStats: SimStats = {
  ipc: 315.23, total_insn: 7569408, total_cycles: 24011,
  occupancy: 0.297, l1_hit_rate: 0.385, l2_hit_rate: 0.506,
  l1i_hit_rate: 0.97, dram_stalls: 532, shmem_stalls: 160,
  l2_bw: 54.09, sim_time_sec: 8,
};

const baseConfig: GPUConfig = {
  n_clusters: 15, cores_per_cluster: 1, n_mem: 6, shmem_size: 49152,
  scheduler: "gto", num_sched_per_core: 2, l1_sets: 32, l2_sets: 64,
};

export const mockHistory: Experiment[] = [
  { exp_id: "1", config: baseConfig,
    stats: {...mockStats, ipc: 315.23},
    benchmark: "dct8x8", container_id: "relaxed_shaw", timestamp: 1 },
  { exp_id: "2", config: {...baseConfig, n_clusters: 30},
    stats: {...mockStats, ipc: 456.58},
    benchmark: "dct8x8", container_id: "relaxed_shaw", timestamp: 2 },
  { exp_id: "3", config: {...baseConfig, n_clusters: 30, l1_sets: 64},
    stats: {...mockStats, ipc: 470.0},
    benchmark: "dct8x8", container_id: "relaxed_shaw", timestamp: 3 },
];
```

## Your Definition Of Done

- Every component looks polished, not default-styled
- The whole UI works with mock data before backend integration
- Real data flows in cleanly once endpoints exist
- The comparison view is genuinely impressive
- SSE streaming displays smoothly without flicker

## Watch Out For

- **Don't block on the backend.** Build everything against mocks. Integrate last.
- **SSE in the browser** uses `EventSource`. Test reconnection handling.
- **The comparison view is your demo moment** — spend extra polish time there.
- **Discrete params, not continuous** — the sliders snap to allowed values only.
