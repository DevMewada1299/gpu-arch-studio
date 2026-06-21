import { createPortal } from "react-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { X, Sparkles } from "lucide-react";
import type { Experiment, GPUConfig } from "../types";

interface CompareModalProps {
  a: Experiment;
  b: Experiment;
  onClose: () => void;
}

const SCHED_LABEL: Record<GPUConfig["scheduler"], string> = {
  gto: "GTO",
  lrr: "LRR",
  two_level_active: "2-Level",
};

// Human-readable rows of a config for the diff table.
function configRows(c: GPUConfig): { key: string; label: string; value: string }[] {
  return [
    { key: "n_clusters", label: "SM Clusters", value: String(c.n_clusters) },
    { key: "cores_per_cluster", label: "Cores / Cluster", value: String(c.cores_per_cluster) },
    { key: "schedulers_per_core", label: "Schedulers / Core", value: String(c.schedulers_per_core) },
    { key: "scheduler", label: "Warp Scheduler", value: SCHED_LABEL[c.scheduler] },
    { key: "l1_sets", label: "L1 Cache", value: `${c.l1_sets} sets · ${(c.l1_sets * 128 * 4) / 1024} KB` },
    { key: "l2_sets", label: "L2 Cache", value: `${c.l2_sets} sets · ${(c.l2_sets * 128 * 8) / 1024} KB` },
    { key: "n_mem", label: "Mem Controllers", value: String(c.n_mem) },
    { key: "shmem_size", label: "Shared Memory", value: `${c.shmem_size / 1024} KB` },
  ];
}

// Synthesize a short explanation of what changed and why IPC moved.
function explainDelta(a: Experiment, b: Experiment): string {
  const diffs: string[] = [];
  const ca = a.config, cb = b.config;
  if (ca.l1_sets !== cb.l1_sets)
    diffs.push(`L1 cache ${ca.l1_sets}→${cb.l1_sets} sets`);
  if (ca.n_clusters !== cb.n_clusters)
    diffs.push(`SM clusters ${ca.n_clusters}→${cb.n_clusters}`);
  if (ca.scheduler !== cb.scheduler)
    diffs.push(`scheduler ${SCHED_LABEL[ca.scheduler]}→${SCHED_LABEL[cb.scheduler]}`);
  if (ca.schedulers_per_core !== cb.schedulers_per_core)
    diffs.push(`schedulers/core ${ca.schedulers_per_core}→${cb.schedulers_per_core}`);
  if (ca.n_mem !== cb.n_mem)
    diffs.push(`mem controllers ${ca.n_mem}→${cb.n_mem}`);

  const ipcDelta = b.stats.ipc - a.stats.ipc;
  const pct = a.stats.ipc !== 0 ? (ipcDelta / a.stats.ipc) * 100 : 0;
  const l1Gain = (b.stats.l1_hit_rate - a.stats.l1_hit_rate) * 100;

  const dir = ipcDelta >= 0 ? "gained" : "lost";
  const driver =
    Math.abs(l1Gain) > 5
      ? `The L1 hit rate moved ${l1Gain >= 0 ? "+" : ""}${l1Gain.toFixed(0)} pts, ` +
        `which dominates the change — fewer L2/DRAM round-trips on the critical path.`
      : `Occupancy and scheduling shifts account for most of the change.`;

  return (
    `Changing ${diffs.length ? diffs.join(", ") : "no parameters"} ` +
    `${dir} ${Math.abs(ipcDelta).toFixed(1)} IPC (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%). ` +
    driver
  );
}

function IpcHeadline({ exp, label, isWinner }: { exp: Experiment; label: string; isWinner: boolean }) {
  return (
    <div
      className={`flex-1 rounded-2xl border p-5 transition-colors ${
        isWinner ? "border-indigo-200 bg-indigo-50/50" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium text-neutral-500">{label}</span>
        <span className="text-[11px] text-neutral-400">{exp.exp_id}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-3xl font-semibold font-metric tracking-tight ${
            isWinner ? "text-indigo-600" : "text-neutral-800"
          }`}
        >
          {exp.stats.ipc.toFixed(2)}
        </span>
        <span className="text-[11px] text-neutral-400">IPC</span>
        {isWinner && (
          <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
            Best
          </span>
        )}
      </div>
    </div>
  );
}

export default function CompareModal({ a, b, onClose }: CompareModalProps) {
  const aWins = a.stats.ipc >= b.stats.ipc;

  const chartData = [
    { metric: "L1 Hit", [a.exp_id]: +(a.stats.l1_hit_rate * 100).toFixed(1), [b.exp_id]: +(b.stats.l1_hit_rate * 100).toFixed(1) },
    { metric: "L2 Hit", [a.exp_id]: +(a.stats.l2_hit_rate * 100).toFixed(1), [b.exp_id]: +(b.stats.l2_hit_rate * 100).toFixed(1) },
    { metric: "Occupancy", [a.exp_id]: +a.stats.occupancy.toFixed(1), [b.exp_id]: +b.stats.occupancy.toFixed(1) },
  ];

  const rowsA = configRows(a.config);
  const rowsB = configRows(b.config);

  // Portal to <body> so the overlay centers on the viewport even when an
  // ancestor (e.g. the History drawer) uses a transform for its animation.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/30 backdrop-blur-sm p-6 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl border border-neutral-200 bg-white shadow-2xl shadow-black/10 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-white/90 backdrop-blur">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900">
              Experiment Comparison
            </h2>
            <p className="text-[12px] text-neutral-400 mt-0.5">
              {a.exp_id} vs {b.exp_id} · {a.benchmark}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* IPC headlines */}
          <div className="flex items-stretch gap-3">
            <IpcHeadline exp={a} label="Experiment A" isWinner={aWins} />
            <div className="flex flex-col items-center justify-center px-2">
              <span className="text-[10px] uppercase tracking-wide text-neutral-400">Δ IPC</span>
              <span
                className={`text-lg font-semibold font-metric ${
                  b.stats.ipc - a.stats.ipc >= 0 ? "text-emerald-600" : "text-rose-500"
                }`}
              >
                {b.stats.ipc - a.stats.ipc >= 0 ? "+" : ""}
                {(b.stats.ipc - a.stats.ipc).toFixed(1)}
              </span>
            </div>
            <IpcHeadline exp={b} label="Experiment B" isWinner={!aWins} />
          </div>

          {/* Grouped bar chart */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white p-5">
            <p className="text-[12px] font-semibold text-neutral-700 mb-3">Key Metrics (%)</p>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="metric"
                    tick={{ fill: "#737373", fontSize: 12 }}
                    axisLine={{ stroke: "#e5e5e5" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#a3a3a3", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.03)" }}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e5e5e5",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey={a.exp_id} fill="#d4d4d4" radius={[4, 4, 0, 0]} />
                  <Bar dataKey={b.exp_id} fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Config diff table */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden">
            <div className="grid grid-cols-3 px-4 py-2.5 border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
              <span>Parameter</span>
              <span className="text-center">{a.exp_id}</span>
              <span className="text-center">{b.exp_id}</span>
            </div>
            {rowsA.map((row, i) => {
              const differs = row.value !== rowsB[i].value;
              return (
                <div
                  key={row.key}
                  className={`grid grid-cols-3 px-4 py-2.5 text-[12px] border-b border-neutral-50 last:border-0 ${
                    differs ? "bg-indigo-50/40" : ""
                  }`}
                >
                  <span className="text-neutral-500">{row.label}</span>
                  <span className={`text-center font-metric ${differs ? "text-neutral-500" : "text-neutral-700"}`}>
                    {row.value}
                  </span>
                  <span className={`text-center font-metric ${differs ? "text-indigo-600 font-semibold" : "text-neutral-700"}`}>
                    {rowsB[i].value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Agent explanation of the delta */}
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={14} className="text-indigo-500" />
              <span className="text-[12px] font-semibold text-indigo-600">
                Orchestrator · delta analysis
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-neutral-700">
              {explainDelta(a, b)}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
