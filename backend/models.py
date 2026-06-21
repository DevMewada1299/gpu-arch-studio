"""Shared data contracts — the seams between layers.

These mirror the TypeScript types in CLAUDE.md exactly. Every layer passes
these instead of loose dicts: the runner returns an Experiment, redis_store
serializes it (to_dict / from_dict), and the Fetch.ai uAgents carry them as
message payloads. Keeping one definition here is what lets Redis and Fetch be
added later without reshaping data at each boundary.
"""

from dataclasses import asdict, dataclass, field
from typing import Optional

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
