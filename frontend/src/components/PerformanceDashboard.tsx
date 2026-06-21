import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import type { SimStats } from "../types";
import { mockHistory } from "../mocks";

// Standalone default: the most recent completed experiment, so the headline
// IPC aligns with the end of the trend line.
const completedMock = mockHistory.filter((e) => e.status === "complete");
const defaultStats: SimStats = completedMock[completedMock.length - 1].stats;

interface PerformanceDashboardProps {
  stats?: SimStats;
  history?: SimStats[];
}

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-neutral-100 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
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

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-neutral-900">Performance</h2>
        <span className="text-[11px] text-neutral-400">latest experiment</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* IPC — headline */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
            IPC
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-3xl font-semibold text-neutral-900 font-metric leading-none">
              {curIpc.toFixed(2)}
            </span>
            {delta != null && (
              <span
                className={`mb-0.5 inline-flex items-center gap-0.5 text-[11px] font-medium font-metric ${
                  delta >= 0 ? "text-emerald-600" : "text-rose-500"
                }`}
              >
                {delta >= 0 ? "↑" : "↓"}
                {Math.abs(deltaPct ?? 0).toFixed(1)}%
              </span>
            )}
          </div>
          {/* Minimal sparkline */}
          <div className="h-9 mt-3 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ipcSeries} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                <Line
                  type="monotone"
                  dataKey="ipc"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Occupancy */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm flex flex-col">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
            Occupancy
          </p>
          <span className="mt-2 text-3xl font-semibold text-neutral-900 font-metric leading-none">
            {stats.occupancy.toFixed(1)}
            <span className="text-lg text-neutral-400">%</span>
          </span>
          <div className="mt-auto pt-5">
            <MiniBar value={stats.occupancy} color="#6366f1" />
          </div>
        </div>

        {/* Cache hit rates */}
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide">
            Cache Hit Rate
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <div className="flex justify-between text-[12px] mb-1.5">
                <span className="text-neutral-500">L1</span>
                <span className="font-metric font-medium text-neutral-800">
                  {(stats.l1_hit_rate * 100).toFixed(1)}%
                </span>
              </div>
              <MiniBar value={stats.l1_hit_rate * 100} color="#f59e0b" />
            </div>
            <div>
              <div className="flex justify-between text-[12px] mb-1.5">
                <span className="text-neutral-500">L2</span>
                <span className="font-metric font-medium text-neutral-800">
                  {(stats.l2_hit_rate * 100).toFixed(1)}%
                </span>
              </div>
              <MiniBar value={stats.l2_hit_rate * 100} color="#10b981" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
