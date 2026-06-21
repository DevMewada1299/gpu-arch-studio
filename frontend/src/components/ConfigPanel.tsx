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
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-slate-400">{label}</span>
        {hint && <span className="text-[10px] font-mono text-slate-600">{hint}</span>}
      </div>
      {children}
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

  return (
    <div className={`space-y-4 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {/* Benchmark selector */}
      <Field label="Benchmark">
        <Segmented
          options={BENCHMARKS.map((b) => ({ value: b, label: b }))}
          value={benchmark}
          onChange={onBenchmarkChange}
        />
      </Field>

      <div className="h-px bg-white/[0.05]" />

      {/* Compute */}
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
          value={config.schedulers_per_core}
          onChange={(v) => set("schedulers_per_core", v)}
        />
      </Field>

      <Field label="Warp Scheduler">
        <Segmented
          options={SCHEDULERS.map((v) => ({ value: v, label: SCHEDULER_LABELS[v] }))}
          value={config.scheduler}
          onChange={(v) => set("scheduler", v)}
        />
      </Field>

      <div className="h-px bg-white/[0.05]" />

      {/* Memory */}
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

      {/* Footer status */}
      <div className="pt-1 flex items-center justify-between">
        <span className="text-[10px] font-mono text-slate-600">
          {isBaseline ? "baseline config" : "modified"}
        </span>
        {!isBaseline && (
          <button
            onClick={() => onChange(baselineConfig)}
            className="text-[10px] font-mono text-cyan-500/70 hover:text-cyan-400 transition-colors"
          >
            reset
          </button>
        )}
      </div>
    </div>
  );
}
