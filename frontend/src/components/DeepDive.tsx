import { createPortal } from "react-dom";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { X, Microscope } from "lucide-react";
import type { Experiment, SimReport } from "../types";

interface DeepDiveProps {
  experiment: Experiment;
  report: SimReport;
  onClose: () => void;
}

// ── formatting helpers ─────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
function fmtBytes(n: number) {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

// Heatmap color: low miss rate → emerald, high → rose (green→amber→red ramp).
function heatColor(missRate: number) {
  const hue = 150 * (1 - Math.max(0, Math.min(1, missRate)));
  return `hsl(${hue}, 68%, 52%)`;
}

const WARP_COLORS: Record<string, string> = {
  issued: "#10b981",
  idle: "#cbd5e1",
  scoreboard: "#f43f5e",
  stall: "#f59e0b",
};

const BOTTLENECK_LABELS: Record<string, string> = {
  rcd: "RCD (row activate)",
  rcdwr: "RCDWR (act→write)",
  wtr: "WTR (write→read)",
  rtw: "RTW (read→write)",
  ccdl: "CCDL (col→col)",
};

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-neutral-200/80 bg-white p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-neutral-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #e5e5e5",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
} as const;

export default function DeepDive({ experiment, report, onClose }: DeepDiveProps) {
  // ── warp-state donut (distinct cycle outcomes) ──────────────────────────
  const warp = report.warp;
  const warpData = (["issued", "idle", "scoreboard", "stall"] as const)
    .map((k) => ({ name: k, value: Number(warp[k] ?? 0) }))
    .filter((d) => d.value > 0);
  const warpTotal = warpData.reduce((s, d) => s + d.value, 0);

  // ── DRAM ────────────────────────────────────────────────────────────────
  const dram = report.dram as Record<string, number> & {
    bottlenecks?: Record<string, number>;
  };
  const dramScalars = [
    { label: "Row-buffer locality", value: Number(dram.row_buffer_locality ?? 0) },
    { label: "Bank-level parallelism", value: Number(dram.bank_level_parallelism ?? 0), raw: true },
    { label: "BW utilization", value: Number(dram.bw_util ?? 0) },
    { label: "DRAM efficiency", value: Number(dram.dram_eff ?? 0) },
  ];
  const bottlenecks = Object.entries(dram.bottlenecks ?? {})
    .map(([k, v]) => ({ name: BOTTLENECK_LABELS[k] ?? k, value: Number(v) }))
    .sort((a, b) => b.value - a.value);

  // ── memory traffic flow (core↔mem by access type) ───────────────────────
  const trafficKeys = Array.from(
    new Set([
      ...Object.keys(report.traffic_coretomem),
      ...Object.keys(report.traffic_memtocore),
    ])
  );
  const traffic = trafficKeys
    .map((k) => ({
      type: k.replace(/_ACC_/, " ").replace(/_/g, " "),
      toMem: report.traffic_coretomem[k] ?? 0,
      toCore: report.traffic_memtocore[k] ?? 0,
    }))
    .filter((t) => t.toMem > 0 || t.toCore > 0)
    .sort((a, b) => b.toMem + b.toCore - (a.toMem + a.toCore));
  const trafficMax = Math.max(1, ...traffic.map((t) => Math.max(t.toMem, t.toCore)));

  // ── latency histograms ──────────────────────────────────────────────────
  const latency = report.latency;
  const latTables: { key: string; label: string; max: number; avg: number }[] = [
    { key: "mf_lat_table", label: "Memory fetch", max: Number(latency.max_mf ?? 0), avg: Number(latency.avg_mf ?? 0) },
    { key: "mrq_lat_table", label: "Memory request queue", max: Number(latency.max_mrq ?? 0), avg: Number(latency.avg_mrq ?? 0) },
    { key: "icnt2mem_lat_table", label: "Interconnect → mem", max: Number(latency.max_icnt2mem ?? 0), avg: Number(latency.avg_icnt2mem ?? 0) },
    { key: "icnt2sh_lat_table", label: "Interconnect → shader", max: Number(latency.max_icnt2sh ?? 0), avg: Number(latency.avg_icnt2sh ?? 0) },
  ];

  // ── cache by access type (stacked hit/miss) ─────────────────────────────
  const cacheByType = Object.entries(report.cache_by_type)
    .map(([k, v]) => ({
      type: k.replace(/_ACC_/, " ").replace(/_/g, ""),
      hit: v.hit,
      miss: v.miss,
    }))
    .filter((d) => d.hit + d.miss > 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm p-4 sm:p-6 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl border border-neutral-200 bg-neutral-50 shadow-2xl shadow-black/10 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Microscope size={18} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-neutral-900">
                Deep Dive · {experiment.exp_id}
              </h2>
              <p className="text-[12px] text-neutral-400 mt-0.5">
                {experiment.benchmark} · low-level profile (Nsight-style)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] uppercase tracking-wide text-neutral-400">IPC</p>
              <p className="text-lg font-semibold font-metric text-indigo-600 leading-none">
                {experiment.stats.ipc.toFixed(2)}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Kernels */}
          <Panel title="Kernels" subtitle={`${report.kernels.length} launches`}>
            <div className="space-y-3">
              {report.kernels.map((k, i) => {
                const occ = k.occupancy ?? 0;
                return (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-1/3 min-w-0">
                      <p className="text-[12px] font-medium text-neutral-800 truncate font-mono">
                        {k.name}
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {fmt(k.insn ?? 0)} insn · {fmt(k.cycles ?? 0)} cyc
                      </p>
                    </div>
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-[11px] text-neutral-400 w-16">IPC {(k.ipc ?? 0).toFixed(1)}</span>
                      <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: pct(occ) }}
                        />
                      </div>
                      <span className="text-[11px] font-metric text-neutral-500 w-12 text-right">
                        {pct(occ)} occ
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Warp donut + DRAM bottlenecks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Warp State" subtitle="cycle outcomes across all warps">
              <div className="flex items-center gap-4">
                <div className="relative w-[150px] h-[150px] flex-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={warpData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={48}
                        outerRadius={70}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {warpData.map((d) => (
                          <Cell key={d.name} fill={WARP_COLORS[d.name] ?? "#a3a3a3"} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => [fmt(Number(v)), "cycles"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-neutral-400">total</span>
                    <span className="text-[13px] font-semibold font-metric text-neutral-800">
                      {warpTotal >= 1e6 ? `${(warpTotal / 1e6).toFixed(1)}M` : fmt(warpTotal)}
                    </span>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {warpData
                    .sort((a, b) => b.value - a.value)
                    .map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-none"
                          style={{ background: WARP_COLORS[d.name] ?? "#a3a3a3" }}
                        />
                        <span className="text-[12px] text-neutral-600 capitalize flex-1">{d.name}</span>
                        <span className="text-[12px] font-metric text-neutral-800">
                          {((d.value / warpTotal) * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  <div className="pt-1 flex gap-2 text-[10px] text-neutral-400">
                    <span>single-issue {fmt(Number(warp.single_issue ?? 0))}</span>
                    <span>·</span>
                    <span>dual {fmt(Number(warp.dual_issue ?? 0))}</span>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="DRAM Bottlenecks" subtitle="timing constraints wasting bandwidth (cycles)">
              <div className="h-[150px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bottlenecks} layout="vertical" margin={{ left: 4, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fill: "#737373", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmt(Number(v)), "cycles"]} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                    <Bar dataKey="value" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          {/* DRAM scalars strip */}
          <Panel title="DRAM Efficiency">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {dramScalars.map((s) => (
                <div key={s.label}>
                  <p className="text-[11px] text-neutral-400">{s.label}</p>
                  <p className="text-xl font-semibold font-metric text-neutral-900 mt-0.5">
                    {s.raw ? s.value.toFixed(2) : pct(s.value)}
                  </p>
                  {!s.raw && (
                    <div className="h-1.5 mt-1.5 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: pct(s.value) }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Panel>

          {/* Per-SM L1D heatmap */}
          <Panel title="Per-SM L1D Cache" subtitle={`${report.per_sm_l1d.length} streaming multiprocessors · color = miss rate`}>
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
              {report.per_sm_l1d.map((sm) => (
                <div
                  key={sm.core}
                  className="group relative rounded-lg p-2 text-center transition-transform hover:scale-[1.04]"
                  style={{ background: heatColor(sm.miss_rate ?? 0) }}
                  title={`SM ${sm.core} · ${fmt(sm.accesses ?? 0)} acc · ${fmt(sm.misses ?? 0)} miss · ${fmt(sm.reservation_fails ?? 0)} resv-fail`}
                >
                  <p className="text-[10px] font-medium text-white/80">SM{sm.core}</p>
                  <p className="text-[12px] font-semibold font-metric text-white">
                    {((sm.miss_rate ?? 0) * 100).toFixed(0)}%
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3 text-[10px] text-neutral-400">
              <span>low miss</span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "linear-gradient(90deg, hsl(150,68%,52%), hsl(75,68%,52%), hsl(0,68%,52%))" }} />
              <span>high miss</span>
            </div>
          </Panel>

          {/* Memory traffic flow */}
          <Panel title="Memory Traffic" subtitle="bytes moved per access type · core → mem and mem → core">
            <div className="space-y-2.5">
              <div className="flex items-center text-[10px] uppercase tracking-wide text-neutral-400">
                <span className="flex-1 text-right pr-2">core → mem</span>
                <span className="w-28 text-center">type</span>
                <span className="flex-1 pl-2">mem → core</span>
              </div>
              {traffic.map((t) => (
                <div key={t.type} className="flex items-center">
                  {/* core → mem (grows leftward) */}
                  <div className="flex-1 flex items-center justify-end gap-2">
                    <span className="text-[10px] font-metric text-neutral-400">
                      {t.toMem > 0 ? fmtBytes(t.toMem) : ""}
                    </span>
                    <div className="w-1/2 flex justify-end">
                      <div
                        className="h-4 rounded-l-md bg-indigo-500/80"
                        style={{ width: `${(t.toMem / trafficMax) * 100}%` }}
                      />
                    </div>
                  </div>
                  {/* label */}
                  <span className="w-28 text-center text-[11px] font-medium text-neutral-600 truncate px-1">
                    {t.type}
                  </span>
                  {/* mem → core (grows rightward) */}
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-1/2">
                      <div
                        className="h-4 rounded-r-md bg-sky-500/80"
                        style={{ width: `${(t.toCore / trafficMax) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-metric text-neutral-400">
                      {t.toCore > 0 ? fmtBytes(t.toCore) : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Latency histograms */}
          <Panel title="Latency Distributions" subtitle="cycles — tail latency reveals memory pressure">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {latTables.map((lt) => {
                const table = (latency[lt.key] as number[] | undefined) ?? [];
                const data = table.map((v, i) => ({ bucket: i, count: v }));
                return (
                  <div key={lt.key}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-neutral-700">{lt.label}</span>
                      <span className="text-[10px] font-metric text-neutral-400">
                        avg {lt.avg} · max {lt.max}
                      </span>
                    </div>
                    <div className="h-[64px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                          <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(v) => [fmt(Number(v)), "count"]}
                            labelFormatter={(l) => `bucket ${l}`}
                          />
                          <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#6366f1"
                            fill="#6366f1"
                            fillOpacity={0.12}
                            strokeWidth={1.5}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          {/* Cache by access type */}
          <Panel title="Cache Accesses by Type" subtitle="L2 hit / miss per access class">
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cacheByType} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                  <XAxis dataKey="type" tick={{ fill: "#737373", fontSize: 10 }} axisLine={{ stroke: "#e5e5e5" }} tickLine={false} interval={0} angle={-15} textAnchor="end" height={42} />
                  <YAxis tick={{ fill: "#a3a3a3", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
                  <Bar dataKey="hit" stackId="c" fill="#10b981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="miss" stackId="c" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />hit</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />miss</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>,
    document.body
  );
}
