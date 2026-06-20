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
  enumerated options: L1 is 16/32/48/64/128, not anything in between)
- A benchmark dropdown (GEMM, vectoradd, BFS, reduction)
- Reads/writes a `GPUConfig` object (type in CLAUDE.md)
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
is ready:

```typescript
export const mockStats: SimStats = {
  ipc: 1.42, l1_hit_rate: 0.41, l2_hit_rate: 0.67,
  dram_stalls: 84210, occupancy: 0.78, total_insn: 2840000
};

export const mockHistory: Experiment[] = [
  { exp_id: "1", config: {...}, stats: {...ipc: 1.4}, benchmark: "gemm", ... },
  { exp_id: "2", config: {...}, stats: {...ipc: 2.1}, benchmark: "gemm", ... },
  { exp_id: "3", config: {...}, stats: {...ipc: 2.8}, benchmark: "gemm", ... },
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
