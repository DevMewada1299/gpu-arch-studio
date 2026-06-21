import type {
  GPUConfig,
  SimStats,
  Experiment,
  Container,
  AgentMessage,
  SimReport,
} from "./types";
import sampleReport from "./sampleReport.json";

// Baseline GTX 480 / Fermi config — field names match the backend contract.
export const baselineConfig: GPUConfig = {
  n_clusters: 15,
  cores_per_cluster: 1,
  n_mem: 6,
  shmem_size: 49152,
  scheduler: "gto",
  num_sched_per_core: 2,
  l1_sets: 32,
  l2_sets: 64,
};

export const mockStats: SimStats = {
  ipc: 274.85,
  total_insn: 7569408,
  total_cycles: 27540,
  occupancy: 0.297, // fraction 0-1
  l1_hit_rate: 0.3849, // 1 - 0.6151
  l2_hit_rate: 0.5063, // 1 - 0.4937
  l1i_hit_rate: 0.9698,
  dram_stalls: 532,
  shmem_stalls: 160,
  l2_bw: 54.09,
  sim_time_sec: 8,
};

// occ is a fraction 0-1 to match the backend contract.
const makeStats = (ipc: number, l1: number, l2: number, occ: number): SimStats => ({
  ipc,
  total_insn: 7569408,
  total_cycles: Math.round(7569408 / ipc),
  occupancy: occ,
  l1_hit_rate: l1,
  l2_hit_rate: l2,
  l1i_hit_rate: 0.97,
  dram_stalls: Math.round(1000 * (1 - l2)),
  shmem_stalls: Math.round(200 * (1 - occ)),
  l2_bw: (54 * ipc) / 274.85,
  sim_time_sec: 8,
});

export const mockHistory: Experiment[] = [
  {
    exp_id: "exp-001",
    config: baselineConfig,
    stats: makeStats(274.85, 0.38, 0.51, 0.297),
    benchmark: "dct8x8",
    container_id: "relaxed_shaw",
    timestamp: Date.now() - 1000 * 60 * 30,
    status: "success",
    error: null,
    log_path: "experiments/exp-001/output.log",
  },
  {
    exp_id: "exp-002",
    config: { ...baselineConfig, n_clusters: 30, l1_sets: 64 },
    stats: makeStats(318.4, 0.52, 0.58, 0.352),
    benchmark: "dct8x8",
    container_id: "relaxed_shaw",
    timestamp: Date.now() - 1000 * 60 * 20,
    status: "success",
    error: null,
    log_path: "experiments/exp-002/output.log",
  },
  {
    exp_id: "exp-003",
    config: { ...baselineConfig, n_clusters: 30, l1_sets: 128, scheduler: "lrr" },
    stats: makeStats(341.2, 0.61, 0.63, 0.418),
    benchmark: "dct8x8",
    container_id: "relaxed_shaw",
    timestamp: Date.now() - 1000 * 60 * 10,
    status: "success",
    error: null,
    log_path: "experiments/exp-003/output.log",
  },
  {
    exp_id: "exp-004",
    config: { ...baselineConfig, n_clusters: 60, l1_sets: 128, scheduler: "lrr", num_sched_per_core: 4 },
    stats: makeStats(389.7, 0.65, 0.67, 0.483),
    benchmark: "dct8x8",
    container_id: "relaxed_shaw",
    timestamp: Date.now() - 1000 * 60 * 5,
    status: "success",
    error: null,
    log_path: "experiments/exp-004/output.log",
  },
  {
    // An errored run — has no valid stats and cannot be compared.
    exp_id: "exp-005",
    config: { ...baselineConfig, n_clusters: 60, l1_sets: 128, scheduler: "two_level_active", num_sched_per_core: 4, n_mem: 8 },
    stats: makeStats(0, 0, 0, 0),
    benchmark: "dct8x8",
    container_id: "relaxed_shaw",
    timestamp: Date.now() - 1000 * 30,
    status: "error",
    error: "simulation aborted: insufficient shared memory for requested config",
    log_path: null,
  },
];

export const mockContainers: Container[] = [
  { id: "relaxed_shaw", name: "relaxed_shaw", image: "gpgpu-sim:fermi", status: "running", busy: false },
  { id: "a1b2c3d4e5", name: "eager_turing", image: "gpgpu-sim:fermi", status: "running", busy: true },
];

// A real SimReport (baseline DCT8x8) for the deep-dive view.
export const mockReport: SimReport = sampleReport as SimReport;

export const mockAgentMessages: AgentMessage[] = [
  {
    agent: "memory",
    content:
      "L1 hit rate is critically low at 38.5%, indicating poor spatial locality. " +
      "The DCT8x8 kernel accesses an 8×8 block of pixels — with 32 sets and 4-way assoc, " +
      "the effective working set fits marginally. Recommend doubling L1 sets to 64 " +
      "to capture the full block without thrashing.",
    status: "complete",
    timestamp: Date.now() - 1000 * 60 * 9,
  },
  {
    agent: "warp",
    content:
      "Occupancy at 29.7% is well below ideal for a DRAM-latency bound kernel. " +
      "GTO scheduler prioritizes oldest warp — with low occupancy there aren't enough " +
      "warps to hide latency. Switching to LRR increases pressure across all warps, " +
      "potentially improving memory-level parallelism.",
    status: "complete",
    timestamp: Date.now() - 1000 * 60 * 8,
  },
  {
    agent: "bottleneck",
    content:
      "Roofline analysis: achieved 274.85 IPC against a memory-bandwidth ceiling. " +
      "L2 BW at 54 GB/s suggests the kernel is memory-latency bound, not bandwidth bound. " +
      "Primary bottleneck is L1 capacity → L2 pressure → DRAM latency chain. " +
      "Address L1 first, then consider increasing SM clusters to expose more parallelism.",
    status: "complete",
    timestamp: Date.now() - 1000 * 60 * 7,
  },
  {
    agent: "orchestrator",
    content:
      "Based on agent analysis, proposing exp-003: clusters=30, L1_sets=128, scheduler=LRR. " +
      "This directly targets the L1 capacity bottleneck while testing LRR's occupancy benefit. " +
      "Expected IPC improvement: +24% over baseline. Queuing exp-004 as follow-up: " +
      "scale clusters to 60 if memory bottleneck resolves with expanded L1.",
    status: "complete",
    timestamp: Date.now() - 1000 * 60 * 6,
  },
];
