import { useState } from "react";
import { Check, Microscope, AlertTriangle } from "lucide-react";
import CompareModal from "./CompareModal";
import DeepDive from "./DeepDive";
import type { Experiment, GPUConfig } from "../types";
import { mockHistory, mockReport } from "../mocks";

const SCHED_LABEL: Record<GPUConfig["scheduler"], string> = {
  gto: "GTO",
  lrr: "LRR",
  two_level_active: "2-Level",
};

interface ExperimentHistoryProps {
  experiments?: Experiment[];
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</span>
      <span className="text-[13px] font-metric font-medium text-neutral-800">{value}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-metric text-neutral-500">
      {children}
    </span>
  );
}

export default function ExperimentHistory({
  experiments = mockHistory,
}: ExperimentHistoryProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [detailExp, setDetailExp] = useState<Experiment | null>(null);

  const toggle = (exp: Experiment) => {
    if (exp.status !== "success") return; // only successful runs are comparable
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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {experiments.map((exp) => {
          const isSelected = selected.includes(exp.exp_id);
          const isError = exp.status === "error";
          return (
            <div
              key={exp.exp_id}
              onClick={() => toggle(exp)}
              className={`w-full rounded-2xl border p-4 transition-all duration-200 ${
                isError
                  ? "border-rose-200/70 bg-rose-50/30 cursor-default"
                  : isSelected
                  ? "border-indigo-300 bg-indigo-50/40 shadow-sm cursor-pointer"
                  : "border-neutral-200/80 bg-white hover:border-neutral-300 hover:shadow-sm cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  {!isError && (
                    <span
                      className={`inline-flex items-center justify-center w-4 h-4 rounded-md border flex-none transition-colors ${
                        isSelected
                          ? "bg-indigo-600 border-indigo-600 text-white"
                          : "border-neutral-300"
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} />}
                    </span>
                  )}
                  <span className="text-[13px] font-semibold text-neutral-900">
                    {exp.exp_id}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {!isError && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailExp(exp);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
                    >
                      <Microscope size={12} />
                      Deep dive
                    </button>
                  )}
                  {isError ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-500">
                      <AlertTriangle size={12} />
                      Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Complete
                    </span>
                  )}
                </div>
              </div>

              {/* Config chips */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <Chip>{exp.config.n_clusters} clusters</Chip>
                <Chip>L1 {exp.config.l1_sets}</Chip>
                <Chip>L2 {exp.config.l2_sets}</Chip>
                <Chip>{SCHED_LABEL[exp.config.scheduler]}</Chip>
              </div>

              {/* Stats — or the error message */}
              {isError ? (
                <p className="text-[12px] text-rose-600/90 leading-relaxed">{exp.error}</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="IPC" value={exp.stats.ipc.toFixed(1)} />
                  <Stat label="L1 Hit" value={`${(exp.stats.l1_hit_rate * 100).toFixed(0)}%`} />
                  <Stat label="L2 Hit" value={`${(exp.stats.l2_hit_rate * 100).toFixed(0)}%`} />
                  <Stat label="Occ" value={`${(exp.stats.occupancy * 100).toFixed(0)}%`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compare action bar */}
      {selectedExps.length > 0 && (
        <div className="flex-none border-t border-neutral-100 bg-white/90 backdrop-blur px-5 py-3 flex items-center justify-between gap-3">
          <span className="text-[12px] text-neutral-500 truncate">
            {selectedExps.length === 1
              ? "Select one more to compare"
              : `${selectedExps[0].exp_id} vs ${selectedExps[1].exp_id}`}
          </span>
          <div className="flex items-center gap-3 flex-none">
            <button
              onClick={() => setSelected([])}
              className="text-[12px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Clear
            </button>
            <button
              disabled={!canCompare}
              onClick={() => setComparing(true)}
              className={`rounded-full px-4 py-1.5 text-[12px] font-semibold transition-colors ${
                canCompare
                  ? "bg-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-neutral-100 text-neutral-400 cursor-not-allowed"
              }`}
            >
              Compare
            </button>
          </div>
        </div>
      )}

      {comparing && canCompare && (
        <CompareModal
          a={selectedExps[0]}
          b={selectedExps[1]}
          onClose={() => setComparing(false)}
        />
      )}

      {detailExp && (
        <DeepDive
          experiment={detailExp}
          report={mockReport}
          onClose={() => setDetailExp(null)}
        />
      )}
    </div>
  );
}
