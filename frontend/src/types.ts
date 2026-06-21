// Shared types — FINALIZED to match the backend contract in
// docs/API_FOR_FRONTEND.md (and backend/models.py). Field names + units here
// are the integration source of truth.

export interface GPUConfig {
  n_clusters: number;          // 8 | 15 | 30 | 60
  cores_per_cluster: number;   // 1 | 2 | 4
  n_mem: number;               // 4 | 6 | 8 | 12
  shmem_size: number;          // bytes: 16384 | 32768 | 49152
  scheduler: "gto" | "lrr" | "two_level_active";
  num_sched_per_core: number;  // 1 | 2 | 4
  l1_sets: number;             // 16 | 32 | 64 | 128
  l2_sets: number;             // 32 | 64 | 128
}

// The HEADLINE tier (dashboard + history). All rates are fractions 0-1.
export interface SimStats {
  ipc: number;                 // gpu_tot_ipc
  total_insn: number;
  total_cycles: number;
  occupancy: number;           // fraction 0-1
  l1_hit_rate: number;         // 0-1
  l2_hit_rate: number;         // 0-1
  l1i_hit_rate: number;        // 0-1
  dram_stalls: number;
  shmem_stalls: number;
  l2_bw: number;               // GB/s
  sim_time_sec: number;
}

export type ExperimentStatus = "success" | "error";

export interface Experiment {
  exp_id: string;
  config: GPUConfig;
  stats: SimStats;
  benchmark: string;
  container_id: string;
  timestamp: number;
  status: ExperimentStatus;
  error: string | null;
  log_path: string | null;
}

// GET /containers — Docker status is the raw string (e.g. "running"); `busy`
// is the boolean the UI keys off of.
export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  busy: boolean;
}

// ── SimReport (deep-dive / Nsight-style) ───────────────────────────────────
// GET /experiments/{id}/details

export interface KernelStat {
  name: string;
  launch_uid: number | null;
  cycles: number | null;
  insn: number | null;
  ipc: number | null;
  occupancy: number | null; // fraction 0-1
}

export interface CoreCacheStat {
  core: number;
  accesses: number | null;
  misses: number | null;
  miss_rate: number | null;
  reservation_fails: number | null;
}

export interface SimReport {
  kernels: KernelStat[];
  per_sm_l1d: CoreCacheStat[];
  cache_by_type: Record<string, { hit: number; miss: number }>;
  traffic_coretomem: Record<string, number>;
  traffic_memtocore: Record<string, number>;
  warp: Record<string, number>;     // stall/idle/scoreboard/issued/single_issue/dual_issue
  latency: Record<string, number | number[]>; // max/avg scalars + *_lat_table histograms
  dram: Record<string, unknown>;    // locality/bw/eff scalars + bottlenecks sub-object
  instr_mix: Record<string, number>;
  stalls: Record<string, number>;
}

// ── Run-flow SSE events (GET /experiments/{id}/stream) ─────────────────────
export type RunStreamEvent =
  | { type: "output"; line: string }
  | {
      type: "complete";
      exp_id: string;
      status: ExperimentStatus;
      error: string | null;
      config: GPUConfig;
      stats: SimStats;
    }
  | { type: "error"; message: string };

// ── Autonomous exploration SSE (GET /explore/{session_id}/stream) ──────────
// Backend status colors for agent cards.
export type AgentColor = "green" | "amber" | "red";

export interface AgentAnalysis {
  agent: string;
  text: string;
  status: AgentColor;
}

export interface RecalledItem {
  exp_id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export type ExploreStreamEvent =
  | { type: "iteration_start"; iteration: number; config: GPUConfig }
  | {
      type: "experiment";
      iteration: number;
      exp_id: string;
      status: ExperimentStatus;
      config: GPUConfig;
      stats: SimStats;
      error: string | null;
    }
  | {
      type: "analysis";
      iteration: number;
      agents: {
        memory: AgentAnalysis;
        warp: AgentAnalysis;
        bottleneck: AgentAnalysis;
      };
    }
  | { type: "recall"; recalled: RecalledItem[] }
  | {
      type: "proposal";
      iteration: number;
      reasoning: string;
      next_config: GPUConfig | null;
      converged: boolean;
      best_exp_id: string | null;
      best_reason: string | null;
    }
  | {
      type: "converged";
      best_exp_id: string | null;
      pareto: string[];
      iterations: number;
    }
  | { type: "note" | "error"; message: string };

// ── Agent UI (frontend card model) ─────────────────────────────────────────
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
