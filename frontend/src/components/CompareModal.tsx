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
      className={`flex-1 rounded-lg border p-4 ${
        isWinner
          ? "border-cyan-500/40 bg-cyan-500/[0.06]"
          : "border-white/[0.08] bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono text-slate-400">{label}</span>
        <span className="text-[10px] font-mono text-slate-600">{exp.exp_id}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-4xl font-mono font-bold tracking-tight ${
            isWinner ? "text-cyan-300" : "text-slate-300"
          }`}
        >
          {exp.stats.ipc.toFixed(2)}
        </span>
        <span className="text-[10px] font-mono text-slate-600">IPC</span>
        {isWinner && (
          <span className="ml-auto text-[10px] font-mono text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10">
            ★ best
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#0B1020] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#0B1020]">
          <div>
            <h2 className="text-sm font-mono font-semibold text-slate-200">
              Experiment Comparison
            </h2>
            <p className="text-[11px] font-mono text-slate-500 mt-0.5">
              {a.exp_id} <span className="text-slate-600">vs</span> {b.exp_id} ·{" "}
              {a.benchmark}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* IPC headlines */}
          <div className="flex gap-3">
            <IpcHeadline exp={a} label="Experiment A" isWinner={aWins} />
            <div className="flex flex-col items-center justify-center px-2">
              <span className="text-[10px] font-mono text-slate-600">Δ IPC</span>
              <span
                className={`text-lg font-mono font-bold ${
                  b.stats.ipc - a.stats.ipc >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {b.stats.ipc - a.stats.ipc >= 0 ? "+" : ""}
                {(b.stats.ipc - a.stats.ipc).toFixed(1)}
              </span>
            </div>
            <IpcHeadline exp={b} label="Experiment B" isWinner={!aWins} />
          </div>

          {/* Grouped bar chart */}
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4">
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-3">
              Key Metrics (%)
            </p>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="metric"
                    tick={{ fill: "#94a3b8", fontSize: 11, fontFamily: "monospace" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    contentStyle={{
                      background: "#0B1020",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
                  <Bar dataKey={a.exp_id} fill="#64748b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey={b.exp_id} fill="#22d3ee" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Config diff table */}
          <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-3 px-4 py-2 border-b border-white/[0.05] text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              <span>Parameter</span>
              <span className="text-center">{a.exp_id}</span>
              <span className="text-center">{b.exp_id}</span>
            </div>
            {rowsA.map((row, i) => {
              const differs = row.value !== rowsB[i].value;
              return (
                <div
                  key={row.key}
                  className={`grid grid-cols-3 px-4 py-2 text-[11px] font-mono border-b border-white/[0.02] ${
                    differs ? "bg-cyan-500/[0.04]" : ""
                  }`}
                >
                  <span className="text-slate-500">{row.label}</span>
                  <span className={`text-center ${differs ? "text-slate-400" : "text-slate-300"}`}>
                    {row.value}
                  </span>
                  <span className={`text-center ${differs ? "text-cyan-300 font-semibold" : "text-slate-300"}`}>
                    {rowsB[i].value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Agent explanation of the delta */}
          <div className="rounded-lg border-l-[3px] border-cyan-500/50 border-y border-r border-white/[0.05] bg-cyan-500/[0.03] p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">
                ✦ Orchestrator — delta analysis
              </span>
            </div>
            <p className="text-[12px] leading-relaxed text-slate-300">
              {explainDelta(a, b)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
