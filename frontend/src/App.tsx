import { useState } from 'react'
import { Play, Sparkles, History, X, SlidersHorizontal, Microscope } from 'lucide-react'
import './App.css'
import ConfigPanel from './components/ConfigPanel'
import PerformanceDashboard from './components/PerformanceDashboard'
import AgentPanel from './components/AgentPanel'
import ExperimentHistory from './components/ExperimentHistory'
import ContainerSelector from './components/ContainerSelector'
import { DeepDiveContent } from './components/DeepDive'
import type { GPUConfig } from './types'
import type { Benchmark } from './constants'
import { baselineConfig, mockContainers, mockReport } from './mocks'

export default function App() {
  const [config, setConfig] = useState<GPUConfig>(baselineConfig)
  const [benchmark, setBenchmark] = useState<Benchmark>("dct8x8")
  const [exploreRunId, setExploreRunId] = useState(0)
  // Default to all idle (non-busy) containers selected for parallel exploration.
  const [containers, setContainers] = useState<string[]>(
    mockContainers.filter((c) => !c.busy).map((c) => c.id)
  )
  // Presentational-only: controls the History slide-out drawer.
  const [historyOpen, setHistoryOpen] = useState(false)
  // Presentational-only: controls the Configuration slide-over (from the left).
  const [configOpen, setConfigOpen] = useState(false)

  // MOCK: no backend yet. Step 2 just logs the emitted GPUConfig.
  const handleRun = () => {
    console.log("RUN — POST /experiments/run", { config, benchmark })
  }

  // MOCK: starts an autonomous agent exploration pass (Step 4).
  const handleExplore = () => {
    console.log("EXPLORE — POST /explore", { benchmark, containers })
    setExploreRunId((id) => id + 1)
  }

  // Run from the Configuration drawer: trigger the existing run flow, then
  // close the drawer. (Run logic unchanged — same handleRun.)
  const handleRunExperiment = () => {
    handleRun()
    setConfigOpen(false)
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-50 text-neutral-900 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none flex items-center justify-between px-6 h-16 border-b border-neutral-200/80 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Logo mark — inline gradient + inline SVG so it never depends on
              Tailwind gradient class generation or the icon library. */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              boxShadow: "0 2px 8px rgba(99,102,241,0.30)",
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
              <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
              <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
            </svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-[22px] leading-none tracking-[-0.02em] whitespace-nowrap">
              <span className="font-extrabold text-neutral-900">GPU</span>
              <span className="font-light text-neutral-400">&nbsp;Architecture&nbsp;</span>
              <span className="font-extrabold text-indigo-600">Studio</span>
            </h1>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-neutral-400 mt-1.5">
              GTX 480 · Fermi · cc 2.0
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ContainerSelector selected={containers} onChange={setContainers} />

          {/* New Configuration — opens the config slide-over from the left */}
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-[13px] font-semibold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
          >
            <SlidersHorizontal size={14} className="text-indigo-500" />
            New Configuration
          </button>

          {/* History — opens the drawer */}
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <History size={14} className="text-neutral-400" />
            History
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
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* Top summary cards — IPC · Occupancy · Cache Hit Rate */}
        <div className="flex-none px-6 pt-6 pb-1">
          <PerformanceDashboard />
        </div>

        {/* Two hero sections — always side by side, equal width */}
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-6 px-6 py-6 overflow-hidden">

          {/* Deep Dive (reuses the exact same visualizations as History → Deep dive) */}
          <section className="flex flex-col min-h-0 rounded-2xl border border-neutral-200/80 bg-neutral-50 overflow-hidden">
            <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-neutral-200/70 bg-white/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Microscope size={16} />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-neutral-900 leading-tight">
                    Deep Dive Analysis
                  </h2>
                  <p className="text-[12px] text-neutral-400 leading-tight">
                    Low-level profile · Nsight-style
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <DeepDiveContent report={mockReport} />
            </div>
          </section>

          {/* AI Exploration Agents */}
          <section className="flex flex-col min-h-0 rounded-2xl border border-neutral-200/80 bg-neutral-50 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <AgentPanel key={exploreRunId} runId={exploreRunId} onProposal={setConfig} />
            </div>
          </section>
        </div>
      </main>

      {/* ── History drawer (unchanged) ─────────────────────────────────── */}
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

      {/* ── Configuration slide-over (from the left) ───────────────────── */}
      {configOpen && (
        <div className="fixed inset-0 z-40">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-neutral-900/20 backdrop-blur-[2px] animate-backdrop-in"
            onClick={() => setConfigOpen(false)}
          />
          {/* Panel (slides from the left) */}
          <div className="absolute left-0 top-0 h-full w-full max-w-[400px] bg-neutral-50 border-r border-neutral-200 shadow-2xl shadow-black/10 flex flex-col animate-drawer-in-left">
            <div className="flex-none flex items-center justify-between px-5 h-16 border-b border-neutral-200 bg-white">
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-900">
                  New Configuration
                </h2>
                <p className="text-[12px] text-neutral-400 mt-0.5">
                  Set up a simulation run
                </p>
              </div>
              <button
                onClick={() => setConfigOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
              <ConfigPanel
                config={config}
                onChange={setConfig}
                benchmark={benchmark}
                onBenchmarkChange={setBenchmark}
              />
            </div>

            {/* Prominent Run Experiment action */}
            <div className="flex-none border-t border-neutral-200 bg-white p-4">
              <button
                onClick={handleRunExperiment}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-[14px] font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20"
              >
                <Play size={15} />
                Run Experiment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
