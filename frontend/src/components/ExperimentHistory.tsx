import { useState } from "react";
import CompareModal from "./CompareModal";
import type { Experiment, GPUConfig } from "../types";
import { mockHistory } from "../mocks";

const SCHED_LABEL: Record<GPUConfig["scheduler"], string> = {
  gto: "GTO",
  lrr: "LRR",
  two_level_active: "2-Level",
};

interface ExperimentHistoryProps {
  experiments?: Experiment[];
}

const COLS = [
  "", "Exp", "Clusters", "Cores", "L1", "L2", "Sched", "IPC", "L1 Hit", "L2 Hit", "Occ%", "Status",
];

export default function ExperimentHistory({
  experiments = mockHistory,
}: ExperimentHistoryProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const toggle = (exp: Experiment) => {
    if (exp.status !== "complete") return; // can't compare an incomplete run
    setSelected((prev) => {
      if (prev.includes(exp.exp_id)) return prev.filter((id) => id !== exp.exp_id);
      if (prev.length >= 2) return [prev[1], exp.exp_id]; // keep most recent two
      return [...prev, exp.exp_id];
    });
  };

  const selectedExps = selected
    .map((id) => experiments.find((e) => e.exp_id === id))
    .filter((e): e is Experiment => !!e);

  const canCompare = selectedExps.length === 2;

  return (
    <div className="relative h-full">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-[#090D1A] z-10">
          <tr className="border-b border-white/[0.05]">
            {COLS.map((c, i) => (
              <th
                key={i}
                className="px-3 py-1.5 text-left font-mono text-slate-600 uppercase text-[10px] tracking-wider font-normal"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {experiments.map((exp) => {
            const isSelected = selected.includes(exp.exp_id);
            const isRunning = exp.status === "running";
            return (
              <tr
                key={exp.exp_id}
                onClick={() => toggle(exp)}
                className={`border-b border-white/[0.02] transition-colors ${
                  isRunning
                    ? "opacity-60 cursor-default"
                    : "cursor-pointer hover:bg-white/[0.03]"
                } ${isSelected ? "bg-cyan-500/[0.08]" : ""}`}
              >
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border ${
                      isSelected
                        ? "bg-cyan-500 border-cyan-500 text-slate-900"
                        : "border-white/15"
                    }`}
                  >
                    {isSelected && <span className="text-[9px] leading-none">✓</span>}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-slate-500">{exp.exp_id}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{exp.config.n_clusters}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{exp.config.cores_per_cluster}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{exp.config.l1_sets}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{exp.config.l2_sets}</td>
                <td className="px-3 py-2 font-mono text-slate-400">{SCHED_LABEL[exp.config.scheduler]}</td>
                <td className="px-3 py-2 font-mono font-semibold text-cyan-300">
                  {isRunning ? "—" : exp.stats.ipc.toFixed(2)}
                </td>
                <td className="px-3 py-2 font-mono text-slate-400">
                  {isRunning ? "—" : `${(exp.stats.l1_hit_rate * 100).toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 font-mono text-slate-400">
                  {isRunning ? "—" : `${(exp.stats.l2_hit_rate * 100).toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 font-mono text-slate-400">
                  {isRunning ? "—" : `${exp.stats.occupancy.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 font-mono">
                  {isRunning ? (
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      running
                    </span>
                  ) : (
                    <span className="text-green-400">complete</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Floating compare action */}
      {selectedExps.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-end gap-3 px-4 py-2 bg-gradient-to-t from-[#090D1A] via-[#090D1A] to-transparent">
          <span className="text-[11px] font-mono text-slate-500">
            {selectedExps.length === 1
              ? "select one more to compare"
              : `${selectedExps[0].exp_id} vs ${selectedExps[1].exp_id}`}
          </span>
          <button
            onClick={() => setSelected([])}
            className="text-[11px] font-mono text-slate-500 hover:text-slate-300 transition-colors"
          >
            clear
          </button>
          <button
            disabled={!canCompare}
            onClick={() => setComparing(true)}
            className={`px-3 py-1.5 rounded text-[11px] font-mono font-semibold transition-colors ${
              canCompare
                ? "bg-cyan-500 text-slate-900 hover:bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                : "bg-slate-800 text-slate-600 cursor-not-allowed"
            }`}
          >
            Compare →
          </button>
        </div>
      )}

      {comparing && canCompare && (
        <CompareModal
          a={selectedExps[0]}
          b={selectedExps[1]}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}
