import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import RadialGauge from "./RadialGauge";
import type { SimStats } from "../types";
import { mockHistory } from "../mocks";

// GTX 480 theoretical peak DRAM bandwidth (GB/s) — used to derive DRAM utilization.
const PEAK_DRAM_BW = 177.4;

// Standalone default: the most recent completed experiment, so the headline
// IPC aligns with the end of the trend line.
const completedMock = mockHistory.filter((e) => e.status === "complete");
const defaultStats: SimStats = completedMock[completedMock.length - 1].stats;

interface PerformanceDashboardProps {
  stats?: SimStats;
  history?: SimStats[];
}

function fmtInt(n: number) {
  return n.toLocaleString("en-US");
}

// Where memory accesses are ultimately served — a stacked proportion that
// always sums to 1. L1 hits serve some; misses fall to L2; L2 misses to DRAM.
function memoryHierarchy(s: SimStats) {
  const l1 = s.l1_hit_rate;
  const l2 = (1 - l1) * s.l2_hit_rate;
  const dram = (1 - l1) * (1 - s.l2_hit_rate);
  return { l1, l2, dram };
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded bg-white/[0.03] border border-white/[0.04] p-3">
      <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-lg font-mono font-semibold text-slate-200">{value}</p>
      {sub && <p className="text-[10px] font-mono text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function PerformanceDashboard({
  stats = defaultStats,
  history,
}: PerformanceDashboardProps) {
  // Build IPC-over-experiments series from completed history if not provided.
  const ipcSeries =
    history?.map((s, i) => ({ exp: i + 1, ipc: s.ipc })) ??
    mockHistory
      .filter((e) => e.status === "complete")
      .map((e, i) => ({ exp: i + 1, ipc: Number(e.stats.ipc.toFixed(1)) }));

  // Delta vs previous experiment.
  const prevIpc = ipcSeries.length >= 2 ? ipcSeries[ipcSeries.length - 2].ipc : null;
  const curIpc = stats.ipc;
  const delta = prevIpc != null ? curIpc - prevIpc : null;
  const deltaPct = prevIpc != null && prevIpc !== 0 ? (delta! / prevIpc) * 100 : null;

  const mh = memoryHierarchy(stats);
  const dramUtil = Math.min(1, stats.l2_bw / PEAK_DRAM_BW);

  const bestIpc = Math.max(...ipcSeries.map((d) => d.ipc), curIpc);

  return (
    <div className="space-y-3">
      {/* ── Headline IPC ─────────────────────────────────────────────── */}
      <div className="rounded-lg bg-gradient-to-br from-cyan-500/[0.07] to-transparent border border-cyan-500/[0.12] p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-1">
              IPC — instructions / cycle
            </p>
            <div className="flex items-end gap-3">
              <p className="text-5xl font-mono font-bold text-cyan-300 tracking-tight leading-none">
                {curIpc.toFixed(2)}
              </p>
              {delta != null && (
                <div
                  className={`mb-1 flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                    delta >= 0
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  <span>{delta >= 0 ? "▲" : "▼"}</span>
                  <span>
                    {delta >= 0 ? "+" : ""}
                    {delta.toFixed(1)}
                  </span>
                  {deltaPct != null && (
                    <span className="text-[10px] opacity-70">
                      ({deltaPct >= 0 ? "+" : ""}
                      {deltaPct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
              vs prev
            </p>
            <p className="text-sm font-mono text-slate-400">
              {prevIpc != null ? prevIpc.toFixed(1) : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Gauges ───────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-4">
        <div className="grid grid-cols-4 gap-2">
          <RadialGauge value={stats.l1_hit_rate} label="L1 Hit" color="#f59e0b" />
          <RadialGauge value={stats.l2_hit_rate} label="L2 Hit" color="#f59e0b" />
          <RadialGauge value={stats.occupancy / 100} label="Occupancy" color="#22d3ee" />
          <RadialGauge value={dramUtil} label="DRAM Util" color="#a78bfa" />
        </div>
      </div>

      {/* ── Memory hierarchy traffic ─────────────────────────────────── */}
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-4">
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-2">
          Memory Hierarchy — where accesses are served
        </p>
        <div className="flex h-7 w-full rounded overflow-hidden border border-white/[0.04]">
          <div
            className="flex items-center justify-center text-[10px] font-mono text-green-950 font-semibold bg-green-400/90"
            style={{ width: `${mh.l1 * 100}%` }}
            title={`L1: ${(mh.l1 * 100).toFixed(1)}%`}
          >
            {mh.l1 > 0.08 ? "L1" : ""}
          </div>
          <div
            className="flex items-center justify-center text-[10px] font-mono text-amber-950 font-semibold bg-amber-400/90"
            style={{ width: `${mh.l2 * 100}%` }}
            title={`L2: ${(mh.l2 * 100).toFixed(1)}%`}
          >
            {mh.l2 > 0.08 ? "L2" : ""}
          </div>
          <div
            className="flex items-center justify-center text-[10px] font-mono text-purple-100 font-semibold bg-purple-500/90"
            style={{ width: `${mh.dram * 100}%` }}
            title={`DRAM: ${(mh.dram * 100).toFixed(1)}%`}
          >
            {mh.dram > 0.08 ? "DRAM" : ""}
          </div>
        </div>
        <div className="flex justify-between mt-2 text-[10px] font-mono">
          <span className="text-green-400">L1 {(mh.l1 * 100).toFixed(0)}%</span>
          <span className="text-amber-400">L2 {(mh.l2 * 100).toFixed(0)}%</span>
          <span className="text-purple-400">DRAM {(mh.dram * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* ── IPC over experiments ─────────────────────────────────────── */}
      <div className="rounded-lg bg-white/[0.03] border border-white/[0.04] p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            IPC over experiments
          </p>
          <p className="text-[10px] font-mono text-slate-600">
            best <span className="text-cyan-400">{bestIpc.toFixed(1)}</span>
          </p>
        </div>
        <div className="h-[140px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ipcSeries} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="exp"
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 20", "dataMax + 20"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#0B1020",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: "monospace",
                }}
                labelStyle={{ color: "#64748b" }}
                labelFormatter={(l) => `experiment ${l}`}
                formatter={(v: number) => [v.toFixed(1), "IPC"]}
              />
              <ReferenceLine y={bestIpc} stroke="#22d3ee" strokeDasharray="2 4" strokeOpacity={0.4} />
              <Line
                type="monotone"
                dataKey="ipc"
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3, fill: "#22d3ee", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#67e8f9" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Secondary metrics ────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard label="Total Insn" value={fmtInt(stats.total_insn)} />
        <MetricCard label="Total Cycles" value={fmtInt(stats.total_cycles)} />
        <MetricCard label="DRAM Stalls" value={fmtInt(stats.dram_stalls)} />
        <MetricCard label="L2 Bandwidth" value={`${stats.l2_bw.toFixed(1)}`} sub="GB/s" />
        <MetricCard label="Sim Time" value={`${stats.sim_time_sec}`} sub="seconds" />
        <MetricCard
          label="Occupancy"
          value={`${stats.occupancy.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}
