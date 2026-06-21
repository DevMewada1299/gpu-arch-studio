// Shared types — mirrors the Python types in backend and CLAUDE.md

export interface GPUConfig {
  n_clusters: number;           // 8 | 15 | 30 | 60
  cores_per_cluster: number;    // 1 | 2 | 4
  l1_sets: number;              // 16 | 32 | 64 | 128  (sets field in dl1 cache string)
  l2_sets: number;              // 32 | 64 | 128       (sets field in dl2 cache string)
  scheduler: "gto" | "lrr" | "two_level_active";
  n_mem: number;                // 4 | 6 | 8 | 12
  shmem_size: number;           // 16384 | 32768 | 49152  (bytes)
  schedulers_per_core: number;  // 1 | 2 | 4
}

export interface SimStats {
  ipc: number;
  l1_hit_rate: number;   // computed as 1 - L1D_total_cache_miss_rate
  l2_hit_rate: number;   // computed as 1 - L2_total_cache_miss_rate
  dram_stalls: number;   // gpu_stall_dramfull
  occupancy: number;     // gpu_occupancy (0–100)
  total_insn: number;    // gpu_tot_sim_insn
  total_cycles: number;  // gpu_tot_sim_cycle
  l2_bw: number;         // L2_BW in GB/s
  sim_time_sec: number;  // wall-clock seconds
}

export type ExperimentStatus = "running" | "complete" | "failed";

export interface Experiment {
  exp_id: string;
  config: GPUConfig;
  stats: SimStats;
  benchmark: string;
  container_id: string;
  timestamp: number;
  status: ExperimentStatus;
}

export interface Container {
  id: string;
  name: string;
  status: "idle" | "busy";
}

export type AgentType = "memory" | "warp" | "bottleneck" | "orchestrator";
export type AgentStatus = "idle" | "thinking" | "complete" | "error";

// The agent's finding severity — drives the card accent color.
// healthy = green, caution = amber, critical = red, neutral = accent.
export type AgentVerdict = "healthy" | "caution" | "critical" | "neutral";

export interface AgentMessage {
  agent: AgentType;
  content: string;
  status: AgentStatus;
  verdict?: AgentVerdict;
  timestamp: number;
}

export interface ExploreSession {
  session_id: string;
  benchmark: string;
  goal: string;
  status: "running" | "complete";
  experiments: Experiment[];
  agent_messages: AgentMessage[];
}
