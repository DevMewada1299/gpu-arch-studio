import { useState } from 'react'
import { Cpu, Play, Sparkles, History, X } from 'lucide-react'
import './App.css'
import ConfigPanel from './components/ConfigPanel'
import PerformanceDashboard from './components/PerformanceDashboard'
import AgentPanel from './components/AgentPanel'
import ExperimentHistory from './components/ExperimentHistory'
import ContainerSelector from './components/ContainerSelector'
import type { GPUConfig } from './types'
import type { Benchmark } from './constants'
import { baselineConfig, mockContainers } from './mocks'

export default function App() {
  const [config, setConfig] = useState<GPUConfig>(baselineConfig)
  const [benchmark, setBenchmark] = useState<Benchmark>("dct8x8")
  const [exploreRunId, setExploreRunId] = useState(0)
  // Default to all idle containers selected for parallel exploration.
  const [containers, setContainers] = useState<string[]>(
    mockContainers.filter((c) => c.status === "idle").map((c) => c.id)
  )
  // Presentational-only: controls the History slide-out drawer.
  const [historyOpen, setHistoryOpen] = useState(false)

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
    <div className="h-screen flex flex-col bg-neutral-50 text-neutral-900 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none flex items-center justify-between px-6 h-16 border-b border-neutral-200/80 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white shadow-sm">
            <Cpu size={17} strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900">
              GPU Architecture Studio
            </h1>
            <p className="text-[11px] text-neutral-400">GTX 480 · Fermi · cc 2.0</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ContainerSelector selected={containers} onChange={setContainers} />

          {/* History — opens the drawer */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <History size={14} className="text-neutral-400" />
            History
          </button>

          {/* Run — secondary */}
          <button
            onClick={handleRun}
            className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Play size={13} className="text-neutral-500" />
            Run
          </button>

          {/* Explore — primary, AI-first */}
          <button
            onClick={handleExplore}
            className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20"
          >
            <Sparkles size={14} />
            Explore
          </button>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left rail — Config */}
        <aside className="w-[320px] flex-none flex flex-col border-r border-neutral-200/80 bg-white overflow-y-auto">
          <div className="px-5 py-5">
            <h2 className="text-sm font-semibold text-neutral-900 mb-4">Configuration</h2>
            <ConfigPanel
              config={config}
              onChange={setConfig}
              benchmark={benchmark}
              onBenchmarkChange={setBenchmark}
            />
          </div>
        </aside>

        {/* Center — Performance + Agents (hero) */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-8 py-10 space-y-10">
            <PerformanceDashboard />
            <AgentPanel key={exploreRunId} runId={exploreRunId} onProposal={setConfig} />
          </div>
        </main>
      </div>

      {/* ── History drawer ──────────────────────────────────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-neutral-900/20 backdrop-blur-[2px] animate-backdrop-in"
            onClick={() => setHistoryOpen(false)}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-neutral-50 border-l border-neutral-200 shadow-2xl shadow-black/10 flex flex-col animate-drawer-in">
            <div className="flex-none flex items-center justify-between px-5 h-16 border-b border-neutral-200 bg-white">
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-900">
                  Experiment History
                </h2>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  Select two runs to compare
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ExperimentHistory />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
