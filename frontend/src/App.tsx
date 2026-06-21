import { useState } from 'react'
import './App.css'
import ConfigPanel from './components/ConfigPanel'
import PerformanceDashboard from './components/PerformanceDashboard'
import AgentPanel from './components/AgentPanel'
import ExperimentHistory from './components/ExperimentHistory'
import ContainerSelector from './components/ContainerSelector'
import type { GPUConfig } from './types'
import type { Benchmark } from './constants'
import { baselineConfig, mockContainers } from './mocks'

// Step 2 — ConfigPanel wired with state. RUN logs the config (mock, no backend).

const ACCENT = "text-cyan-400"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.18em] mb-3 select-none">
      {children}
    </p>
  )
}

function StatusDot({ active = true }: { active?: boolean }) {
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${
        active ? "bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.7)]" : "bg-slate-600"
      }`}
    />
  )
}

export default function App() {
  const [config, setConfig] = useState<GPUConfig>(baselineConfig)
  const [benchmark, setBenchmark] = useState<Benchmark>("dct8x8")
  const [exploreRunId, setExploreRunId] = useState(0)
  // Default to all idle containers selected for parallel exploration.
  const [containers, setContainers] = useState<string[]>(
    mockContainers.filter((c) => c.status === "idle").map((c) => c.id)
  )

  // MOCK: no backend yet. Step 2 just logs the emitted GPUConfig.
  const handleRun = () => {
    console.log("RUN — POST /experiments/run", { config, benchmark })
  }

  // MOCK: starts an autonomous agent exploration pass (Step 4).
  const handleExplore = () => {
    console.log("EXPLORE — POST /explore", { benchmark, containers })
    setExploreRunId((id) => id + 1)
  }

  return (
    <div className="h-screen flex flex-col bg-[#090D1A] text-slate-100 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none flex items-center justify-between px-6 h-14 border-b border-white/[0.06] bg-[#0B1020]">
        <div className="flex items-center gap-3">
          <StatusDot />
          <span className="text-sm font-mono font-medium tracking-wide text-slate-200">
            GPU Architecture Studio
          </span>
          <span className="hidden sm:inline text-xs text-slate-600 font-mono">
            GTX 480 · Fermi · cc2.0
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Container selector */}
          <ContainerSelector selected={containers} onChange={setContainers} />

          {/* Active benchmark (controlled from ConfigPanel) */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/40 border border-white/[0.06] text-xs text-slate-400">
            <span className="text-slate-600">bench</span>
            <span className="font-mono text-slate-200">{benchmark}</span>
          </div>

          {/* Explore toggle */}
          <button
            onClick={handleExplore}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/80 border border-white/[0.08] text-xs text-slate-300 hover:border-slate-600 transition-colors"
          >
            <span className={ACCENT}>✦</span>
            <span>Explore</span>
          </button>

          {/* Run button */}
          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-5 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-semibold transition-colors shadow-[0_0_16px_rgba(34,211,238,0.25)]"
          >
            <span>▶</span>
            <span>RUN</span>
          </button>
        </div>
      </header>

      {/* ── Main three-column area ──────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left — Config Panel */}
        <aside className="w-[264px] flex-none flex flex-col border-r border-white/[0.06] overflow-y-auto bg-[#090D1A]">
          <div className="p-4 flex-1">
            <SectionLabel>Config Panel</SectionLabel>
            <ConfigPanel
              config={config}
              onChange={setConfig}
              benchmark={benchmark}
              onBenchmarkChange={setBenchmark}
            />
          </div>
        </aside>

        {/* Center — Performance Dashboard */}
        <main className="flex-1 flex flex-col border-r border-white/[0.06] overflow-y-auto bg-[#090D1A]">
          <div className="p-4 flex-1">
            <SectionLabel>Performance Dashboard</SectionLabel>
            <PerformanceDashboard />
          </div>
        </main>

        {/* Right — Agent Panel */}
        <aside className="w-[300px] flex-none flex flex-col overflow-y-auto bg-[#090D1A]">
          <div className="p-4 flex-1">
            <SectionLabel>Agent Panel</SectionLabel>
            <AgentPanel key={exploreRunId} runId={exploreRunId} onProposal={setConfig} />
          </div>
        </aside>
      </div>

      {/* ── Bottom — Experiment History ─────────────────────────────────── */}
      <div className="flex-none h-[220px] border-t border-white/[0.06] flex flex-col bg-[#090D1A]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04]">
          <SectionLabel>Experiment History</SectionLabel>
          <span className="text-[10px] text-slate-600 font-mono">
            Select two rows to compare
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ExperimentHistory />
        </div>
      </div>

    </div>
  )
}
