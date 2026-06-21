import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Segmented } from "./Segmented";
import type { GPUConfig } from "../types";
import { BENCHMARKS, type Benchmark } from "../constants";
import { baselineConfig } from "../mocks";

// Discrete allowed values — straight from CLAUDE.md. These are enumerated
// options, NOT continuous ranges. Controls snap to these only.
const N_CLUSTERS = [8, 15, 30, 60];
const CORES_PER_CLUSTER = [1, 2, 4];
const N_MEM = [4, 6, 8, 12];
const SHMEM = [16384, 32768, 49152]; // bytes
const SCHEDULERS_PER_CORE = [1, 2, 4];
const L1_SETS = [16, 32, 64, 128];
const L2_SETS = [32, 64, 128];
const SCHEDULERS: GPUConfig["scheduler"][] = ["gto", "lrr", "two_level_active"];

// Total L1/L2 size = sets × linesize(128) × assoc. dl1 assoc=4, dl2 assoc=8.
function l1SizeKb(sets: number) {
  return (sets * 128 * 4) / 1024;
}
function l2SizeKb(sets: number) {
  return (sets * 128 * 8) / 1024;
}

const SCHEDULER_LABELS: Record<GPUConfig["scheduler"], string> = {
  gto: "GTO",
  lrr: "LRR",
  two_level_active: "2-Level",
};

interface ConfigPanelProps {
  config: GPUConfig;
  onChange: (config: GPUConfig) => void;
  benchmark: Benchmark;
  onBenchmarkChange: (b: Benchmark) => void;
  disabled?: boolean;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-neutral-700">{label}</span>
        {hint && (
          <span className="text-[11px] font-metric text-neutral-400">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// Presentational disclosure — hides complexity until opened. No business logic.
function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50/80 transition-colors"
      >
        <span className="text-[13px] font-semibold text-neutral-800">{title}</span>
        <ChevronDown
          size={16}
          className={`text-neutral-400 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1 space-y-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function ConfigPanel({
  config,
  onChange,
  benchmark,
  onBenchmarkChange,
  disabled = false,
}: ConfigPanelProps) {
  const set = <K extends keyof GPUConfig>(key: K, value: GPUConfig[K]) =>
    onChange({ ...config, [key]: value });

  const isBaseline = JSON.stringify(config) === JSON.stringify(baselineConfig);

  // Presentational-only disclosure state.
  const [computeOpen, setComputeOpen] = useState(true);
  const [memoryOpen, setMemoryOpen] = useState(false);

  return (
    <div className={`space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Benchmark — always visible */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white px-4 py-4 space-y-2">
        <span className="text-[13px] font-medium text-neutral-700">Benchmark</span>
        <Segmented
          options={BENCHMARKS.map((b) => ({ value: b, label: b }))}
          value={benchmark}
          onChange={onBenchmarkChange}
        />
      </div>

      {/* Compute — collapsible */}
      <Section title="Compute" open={computeOpen} onToggle={() => setComputeOpen((o) => !o)}>
        <Field label="SM Clusters">
          <Segmented
            options={N_CLUSTERS.map((v) => ({ value: v, label: String(v) }))}
            value={config.n_clusters}
            onChange={(v) => set("n_clusters", v)}
          />
        </Field>
        <Field label="Cores / Cluster">
          <Segmented
            options={CORES_PER_CLUSTER.map((v) => ({ value: v, label: String(v) }))}
            value={config.cores_per_cluster}
            onChange={(v) => set("cores_per_cluster", v)}
          />
        </Field>
        <Field label="Schedulers / Core">
          <Segmented
            options={SCHEDULERS_PER_CORE.map((v) => ({ value: v, label: String(v) }))}
            value={config.num_sched_per_core}
            onChange={(v) => set("num_sched_per_core", v)}
          />
        </Field>
        <Field label="Warp Scheduler">
          <Segmented
            options={SCHEDULERS.map((v) => ({ value: v, label: SCHEDULER_LABELS[v] }))}
            value={config.scheduler}
            onChange={(v) => set("scheduler", v)}
          />
        </Field>
      </Section>

      {/* Memory — collapsible */}
      <Section title="Memory" open={memoryOpen} onToggle={() => setMemoryOpen((o) => !o)}>
        <Field label="L1 Cache" hint={`${l1SizeKb(config.l1_sets)} KB`}>
          <Segmented
            options={L1_SETS.map((v) => ({ value: v, label: String(v) }))}
            value={config.l1_sets}
            onChange={(v) => set("l1_sets", v)}
          />
        </Field>
        <Field label="L2 Cache" hint={`${l2SizeKb(config.l2_sets)} KB`}>
          <Segmented
            options={L2_SETS.map((v) => ({ value: v, label: String(v) }))}
            value={config.l2_sets}
            onChange={(v) => set("l2_sets", v)}
          />
        </Field>
        <Field label="Memory Controllers">
          <Segmented
            options={N_MEM.map((v) => ({ value: v, label: String(v) }))}
            value={config.n_mem}
            onChange={(v) => set("n_mem", v)}
          />
        </Field>
        <Field label="Shared Memory" hint={`${config.shmem_size / 1024} KB`}>
          <Segmented
            options={SHMEM.map((v) => ({ value: v, label: `${v / 1024}K` }))}
            value={config.shmem_size}
            onChange={(v) => set("shmem_size", v)}
          />
        </Field>
      </Section>

      {/* Footer status */}
      <div className="flex items-center justify-between px-1 pt-1">
        <span className="text-[11px] text-neutral-400">
          {isBaseline ? "Baseline configuration" : "Modified"}
        </span>
        {!isBaseline && (
          <button
            onClick={() => onChange(baselineConfig)}
            className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
