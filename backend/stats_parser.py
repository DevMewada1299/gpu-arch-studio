"""Parse GPGPU-Sim stdout into a SimStats.

Written against REAL output (see sample/out.txt). Important realities:
  * Stats are dumped MULTIPLE times during a run (periodic + final). We take
    the LAST occurrence of each field — the final cumulative value.
  * Cache fields are MISS rates; hit_rate = 1 - miss_rate.
  * gpu_occupancy is a percentage ("32.4137%") — stored as a fraction 0-1.
  * The bandwidth field is `L2_BW_total` (aggregate), NOT `L2_BW` (which is a
    single-partition value that also appears in the output).
  * gpgpu_simulation_time is a human string
    ("0 days, 0 hrs, 0 min, 21 sec (21 sec)") — parsed to total seconds.
Missing fields return None rather than raising, so a malformed/partial run
still yields a usable (if incomplete) SimStats.
"""

import re
from typing import Optional

from .models import SimStats


def _last_float(pattern: str, text: str) -> Optional[float]:
    matches = re.findall(pattern, text)
    return float(matches[-1]) if matches else None


def _last_int(pattern: str, text: str) -> Optional[int]:
    matches = re.findall(pattern, text)
    return int(matches[-1]) if matches else None


def _hit_rate_from_miss(pattern: str, text: str) -> Optional[float]:
    miss = _last_float(pattern, text)
    return None if miss is None else round(1.0 - miss, 4)


def _parse_sim_time(text: str) -> Optional[int]:
    # "gpgpu_simulation_time = 0 days, 0 hrs, 0 min, 21 sec (21 sec)"
    m = re.findall(
        r"gpgpu_simulation_time\s*=\s*(\d+)\s*days?,\s*(\d+)\s*hrs?,\s*"
        r"(\d+)\s*min,\s*(\d+)\s*sec",
        text,
    )
    if not m:
        return None
    days, hrs, mins, secs = (int(x) for x in m[-1])
    return days * 86400 + hrs * 3600 + mins * 60 + secs


def parse_stats(output: str) -> SimStats:
    """Extract a SimStats from raw GPGPU-Sim stdout."""
    occ_pct = _last_float(r"gpu_occupancy\s*=\s*([\d.]+)%", output)

    return SimStats(
        ipc=_last_float(r"gpu_tot_ipc\s*=\s*([\d.]+)", output),
        total_insn=_last_int(r"gpu_tot_sim_insn\s*=\s*(\d+)", output),
        total_cycles=_last_int(r"gpu_tot_sim_cycle\s*=\s*(\d+)", output),
        occupancy=None if occ_pct is None else round(occ_pct / 100.0, 4),
        l1_hit_rate=_hit_rate_from_miss(
            r"L1D_total_cache_miss_rate\s*=\s*([\d.]+)", output
        ),
        l2_hit_rate=_hit_rate_from_miss(
            r"L2_total_cache_miss_rate\s*=\s*([\d.]+)", output
        ),
        l1i_hit_rate=_hit_rate_from_miss(
            r"L1I_total_cache_miss_rate\s*=\s*([\d.]+)", output
        ),
        dram_stalls=_last_int(r"gpu_stall_dramfull\s*=\s*(\d+)", output),
        shmem_stalls=_last_int(r"gpgpu_n_stall_shd_mem\s*=\s*(\d+)", output),
        l2_bw=_last_float(r"L2_BW_total\s*=\s*([\d.]+)", output),
        sim_time_sec=_parse_sim_time(output),
    )


def is_success(output: str) -> bool:
    """GPGPU-Sim prints SUCCESS on a clean DCT8x8 run."""
    return "SUCCESS" in output
