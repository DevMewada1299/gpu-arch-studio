import { useEffect, useRef, useState } from 'react'
import { Play, Sparkles, History, X, SlidersHorizontal, Microscope, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import './App.css'
import ConfigPanel from './components/ConfigPanel'
import PerformanceDashboard from './components/PerformanceDashboard'
import AgentPanel from './components/AgentPanel'
import ExperimentHistory from './components/ExperimentHistory'
import ContainerSelector from './components/ContainerSelector'
import { DeepDiveContent } from './components/DeepDive'
import { api } from './lib/api'
import type { GPUConfig, SimStats, SimReport, Experiment, Container } from './types'
import { baselineConfig, mockContainers, mockHistory, mockReport } from './mocks'

type RunStatus = 'idle' | 'running' | 'done' | 'error'

export default function App() {
  const [config, setConfig] = useState<GPUConfig>(baselineConfig)
  const [benchmark, setBenchmark] = useState<string>("dct8x8")
  const [benchmarks, setBenchmarks] = useState<string[]>(["dct8x8"])
  const [goal, setGoal] = useState("Maximize IPC")
  const [exploreRunId, setExploreRunId] = useState(0)

  // Live backend data (with graceful fallback to mocks when offline).
  const [containerList, setContainerList] = useState<Container[]>(mockContainers)
  const [containers, setContainers] = useState<string[]>([])
  const [history, setHistory] = useState<Experiment[]>([])

  // Current experiment driving the dashboard + Home deep-dive.
  const [currentStats, setCurrentStats] = useState<SimStats | null>(null)
  const [homeReport, setHomeReport] = useState<SimReport | null>(null)

  // Manual-run streaming state.
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [runLine, setRunLine] = useState("")
  const [runError, setRunError] = useState<string | null>(null)
  const [runIpc, setRunIpc] = useState<number | null>(null)
  const runHandle = useRef<{ cancel: () => void } | null>(null)

  // Presentational drawers.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)

  const refreshHistory = () => {
    api.history().then(setHistory).catch(() => {})
  }

  const loadDetails = (expId: string) => {
    api.details(expId).then(setHomeReport).catch(() => {})
  }

  // ── initial load: health (benchmarks), containers, history ──────────────
  // All setState happens inside async callbacks (allowed in effects).
  useEffect(() => {
    api.health()
      .then((h) => h.benchmarks?.length && setBenchmarks(h.benchmarks))
      .catch(() => {})
    const applyContainers = (list: Container[]) => {
      const cs = list.length ? list : mockContainers
      setContainerList(cs)
      setContainers(cs.filter((c) => !c.busy).map((c) => c.id))
    }
    api.containers()
      .then(applyContainers)
      .catch(() => applyContainers([])) // /containers 500s without Docker → mock fallback
    api.history().then(setHistory).catch(() => {})
  }, [])

  // Auto-dismiss the run toast after it settles.
  useEffect(() => {
    if (runStatus === 'done' || runStatus === 'error') {
      const id = setTimeout(() => setRunStatus('idle'), 5000)
      return () => clearTimeout(id)
    }
  }, [runStatus])

  // ── manual run: POST /experiments/run → EventSource stream ──────────────
  const handleRunExperiment = () => {
    setConfigOpen(false)
    setRunStatus('running')
    setRunLine("starting simulation…")
    setRunError(null)
    setRunIpc(null)
    runHandle.current?.cancel()

    api.run({ config, benchmark })
      .then(({ exp_id }) => {
        runHandle.current = api.streamRun(exp_id, (e) => {
          if (e.type === 'output') {
            setRunLine(e.line)
          } else if (e.type === 'complete') {
            if (e.status === 'success') {
              setCurrentStats(e.stats)
              setRunIpc(e.stats.ipc)
              setRunStatus('done')
              loadDetails(e.exp_id)
            } else {
              setRunStatus('error')
              setRunError(e.error ?? 'simulation failed')
            }
            refreshHistory()
          } else if (e.type === 'error') {
            setRunStatus('error')
            setRunError(e.message)
          }
        })
      })
      .catch((err: unknown) => {
        setRunStatus('error')
        setRunError(err instanceof Error ? err.message : String(err))
      })
  }

  // ── autonomous exploration ──────────────────────────────────────────────
  const handleExplore = () => setExploreRunId((id) => id + 1)

  // During exploration, each finished experiment updates the dashboard + deep-dive live.
  const handleExploreExperiment = (expId: string, stats: SimStats) => {
    setCurrentStats(stats)
    loadDetails(expId)
  }

  // ── derived display data ────────────────────────────────────────────────
  const successStats = history.filter((e) => e.status === 'success').map((e) => e.stats)
  const dashboardHistory = successStats.length ? successStats : undefined
  const historyForDrawer = history.length ? history : mockHistory
  const reportForDeepDive = homeReport ?? mockReport

  return (
    <div className="h-screen flex flex-col bg-neutral-50 text-neutral-900 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex-none flex items-center justify-between px-6 h-16 border-b border-neutral-200/80 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Logo mark — inline gradient + inline SVG so it always renders. */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              boxShadow: "0 2px 8px rgba(99,102,241,0.30)",
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" />
              <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
              <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
            </svg>
          </div>
          <div className="leading-tight">
            <h1 className="text-[20px] leading-none tracking-[-0.02em] whitespace-nowrap">
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
          <ContainerSelector containers={containerList} selected={containers} onChange={setContainers} />

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
          <PerformanceDashboard stats={currentStats ?? undefined} history={dashboardHistory} />
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
              <DeepDiveContent report={reportForDeepDive} />
            </div>
          </section>

          {/* AI Exploration Agents */}
          <section className="flex flex-col min-h-0 rounded-2xl border border-neutral-200/80 bg-neutral-50 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <AgentPanel
                key={exploreRunId}
                runId={exploreRunId}
                goal={goal}
                onGoalChange={setGoal}
                benchmark={benchmark}
                startConfig={config}
                onProposal={setConfig}
                onExperiment={handleExploreExperiment}
                onConverged={refreshHistory}
              />
            </div>
          </section>
        </div>
      </main>

      {/* ── Run status toast (manual run streaming) ────────────────────── */}
      {runStatus !== 'idle' && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
          <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg shadow-black/10 min-w-[320px] max-w-[520px]">
            {runStatus === 'running' && <Loader2 size={16} className="text-indigo-500 animate-spin flex-none" />}
            {runStatus === 'done' && <CheckCircle2 size={16} className="text-emerald-500 flex-none" />}
            {runStatus === 'error' && <AlertTriangle size={16} className="text-rose-500 flex-none" />}
            <div className="min-w-0">
              {runStatus === 'running' && (
                <>
                  <p className="text-[13px] font-medium text-neutral-800">Running simulation…</p>
                  <p className="text-[11px] font-mono text-neutral-400 truncate">{runLine}</p>
                </>
              )}
              {runStatus === 'done' && (
                <p className="text-[13px] font-medium text-neutral-800">
                  Run complete · IPC <span className="font-metric text-indigo-600">{runIpc?.toFixed(2)}</span>
                </p>
              )}
              {runStatus === 'error' && (
                <p className="text-[13px] font-medium text-rose-700 truncate">{runError ?? 'Run failed'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── History drawer (unchanged behavior) ────────────────────────── */}
      {historyOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-neutral-900/20 backdrop-blur-[2px] animate-backdrop-in"
            onClick={() => setHistoryOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-neutral-50 border-l border-neutral-200 shadow-2xl shadow-black/10 flex flex-col animate-drawer-in">
            <div className="flex-none flex items-center justify-between px-5 h-16 border-b border-neutral-200 bg-white">
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-900">Experiment History</h2>
                <p className="text-[12px] text-neutral-400 mt-0.5">Select two runs to compare</p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ExperimentHistory experiments={historyForDrawer} />
            </div>
          </div>
        </div>
      )}

      {/* ── Configuration slide-over (from the left) ───────────────────── */}
      {configOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-neutral-900/20 backdrop-blur-[2px] animate-backdrop-in"
            onClick={() => setConfigOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-full max-w-[400px] bg-neutral-50 border-r border-neutral-200 shadow-2xl shadow-black/10 flex flex-col animate-drawer-in-left">
            <div className="flex-none flex items-center justify-between px-5 h-16 border-b border-neutral-200 bg-white">
              <div>
                <h2 className="text-[15px] font-semibold text-neutral-900">New Configuration</h2>
                <p className="text-[12px] text-neutral-400 mt-0.5">Set up a simulation run</p>
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
                benchmarks={benchmarks}
              />
            </div>

            <div className="flex-none border-t border-neutral-200 bg-white p-4">
              <button
                onClick={handleRunExperiment}
                disabled={runStatus === 'running'}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-[14px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm shadow-indigo-600/20"
              >
                {runStatus === 'running' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                Run Experiment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
