"""Shared data contracts — the seams between layers.

These mirror the TypeScript types in CLAUDE.md exactly. Every layer passes
these instead of loose dicts: the runner returns an Experiment, redis_store
serializes it (to_dict / from_dict), and the Fetch.ai uAgents carry them as
message payloads. Keeping one definition here is what lets Redis and Fetch be
added later without reshaping data at each boundary.
"""

from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

# config_generator validates allowed values; this enum is just for type clarity.
Scheduler = str  # "gto" | "lrr" | "two_level_active"


@dataclass
class GPUConfig:
    n_clusters: int = 15
    cores_per_cluster: int = 1
    n_mem: int = 6
    shmem_size: int = 49152          # bytes
    scheduler: Scheduler = "gto"
    num_sched_per_core: int = 2
    l1_sets: int = 32
    l2_sets: int = 64

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "GPUConfig":
        return cls(**{k: d[k] for k in d if k in cls.__dataclass_fields__})


@dataclass
class SimStats:
    ipc: Optional[float] = None          # gpu_tot_ipc
    total_insn: Optional[int] = None     # gpu_tot_sim_insn
    total_cycles: Optional[int] = None   # gpu_tot_sim_cycle
    occupancy: Optional[float] = None    # gpu_occupancy, fraction 0-1
    l1_hit_rate: Optional[float] = None  # 1 - L1D_total_cache_miss_rate
    l2_hit_rate: Optional[float] = None  # 1 - L2_total_cache_miss_rate
    l1i_hit_rate: Optional[float] = None # 1 - L1I_total_cache_miss_rate
    dram_stalls: Optional[int] = None    # gpu_stall_dramfull
    shmem_stalls: Optional[int] = None   # gpgpu_n_stall_shd_mem
    l2_bw: Optional[float] = None        # L2_BW_total, GB/s
    sim_time_sec: Optional[int] = None   # gpgpu_simulation_time, seconds

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "SimStats":
        return cls(**{k: d[k] for k in d if k in cls.__dataclass_fields__})


@dataclass
class KernelStat:
    """Per-kernel stats (DCT8x8 launches several kernels)."""
    name: str
    launch_uid: Optional[int] = None
    cycles: Optional[int] = None
    insn: Optional[int] = None
    ipc: Optional[float] = None
    occupancy: Optional[float] = None  # fraction 0-1


@dataclass
class CoreCacheStat:
    """Per-SM L1D cache stats — drives the per-core heatmap."""
    core: int
    accesses: Optional[int] = None
    misses: Optional[int] = None
    miss_rate: Optional[float] = None
    reservation_fails: Optional[int] = None


@dataclass
class SimReport:
    """Rich, structured low-level profile for the Nsight-style deep-dive view.

    This is the heavy tier: served on demand via /experiments/{id}/details and
    stored with the experiment. The light SimStats stays the headline contract.
    Flexible blocks are plain dicts so they serialize straight to JSON for the
    frontend (heatmaps, traffic flow, stall attribution, latency curves).
    """
    kernels: List[KernelStat] = field(default_factory=list)
    per_sm_l1d: List[CoreCacheStat] = field(default_factory=list)
    # access_type -> {"hit": int, "miss": int}
    cache_by_type: Dict[str, Dict[str, int]] = field(default_factory=dict)
    # access_type -> bytes
    traffic_coretomem: Dict[str, int] = field(default_factory=dict)
    traffic_memtocore: Dict[str, int] = field(default_factory=dict)
    warp: Dict[str, object] = field(default_factory=dict)      # stall/idle/scoreboard/issue
    latency: Dict[str, object] = field(default_factory=dict)   # max/avg + histograms
    dram: Dict[str, object] = field(default_factory=dict)      # locality/bw/eff + bottlenecks
    instr_mix: Dict[str, int] = field(default_factory=dict)
    stalls: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "SimReport":
        d = dict(d or {})
        kernels = [KernelStat(**k) for k in d.get("kernels", [])]
        per_sm = [CoreCacheStat(**c) for c in d.get("per_sm_l1d", [])]
        return cls(
            kernels=kernels,
            per_sm_l1d=per_sm,
            cache_by_type=d.get("cache_by_type", {}),
            traffic_coretomem=d.get("traffic_coretomem", {}),
            traffic_memtocore=d.get("traffic_memtocore", {}),
            warp=d.get("warp", {}),
            latency=d.get("latency", {}),
            dram=d.get("dram", {}),
            instr_mix=d.get("instr_mix", {}),
            stalls=d.get("stalls", {}),
        )


@dataclass
class AgentOutput:
    """One agent's analysis of an experiment (streamed to the UI)."""
    agent: str                      # "memory" | "warp" | "bottleneck" | "orchestrator"
    text: str = ""
    status: str = "amber"           # "green" | "amber" | "red"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Experiment:
    exp_id: str
    config: GPUConfig
    stats: SimStats
    benchmark: str
    container_id: str
    timestamp: float
    status: str = "success"              # "success" | "error"
    error: Optional[str] = None          # populated when status == "error"
    log_path: Optional[str] = None       # host path to the saved output.log

    def to_dict(self) -> dict:
        d = asdict(self)  # recursively dictifies nested dataclasses
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Experiment":
        return cls(
            exp_id=d["exp_id"],
            config=GPUConfig.from_dict(d.get("config", {})),
            stats=SimStats.from_dict(d.get("stats", {})),
            benchmark=d["benchmark"],
            container_id=d["container_id"],
            timestamp=d["timestamp"],
            status=d.get("status", "success"),
            error=d.get("error"),
            log_path=d.get("log_path"),
        )
