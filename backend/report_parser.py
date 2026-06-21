"""Parse GPGPU-Sim output into a rich, structured SimReport.

This is the "Nsight-grade" tier: per-SM cache heatmap, cache/traffic
breakdowns, warp-state distribution, latency histograms, DRAM bandwidth
bottlenecks, instruction mix, and stall attribution. Built for the frontend
deep-dive view (and available to agents as curated slices).

Conventions (same realities as stats_parser):
  * stats are dumped per-kernel and accumulate; cumulative blocks use the LAST
    occurrence. Kernels are collected as a list (one entry per launch).
  * miss_rate kept as-is (0-1); occupancy % -> fraction.
  * DRAM metrics are per-memory-partition; rates are averaged, bottleneck
    cycle-limits summed, to give one aggregate panel.
"""

import re
from typing import Dict, List, Optional

from .models import CoreCacheStat, KernelStat, SimReport

_CACHE_TYPES = [
    "GLOBAL_ACC_R", "GLOBAL_ACC_W", "LOCAL_ACC_R", "LOCAL_ACC_W",
    "CONST_ACC_R", "TEXTURE_ACC_R", "INST_ACC_R",
]
_INSTR_FIELDS = {
    "load": r"gpgpu_n_load_insn\s*=\s*(\d+)",
    "store": r"gpgpu_n_store_insn\s*=\s*(\d+)",
    "shmem": r"gpgpu_n_shmem_insn\s*=\s*(\d+)",
    "const_mem": r"gpgpu_n_const_mem_insn\s*=\s*(\d+)",
    "param_mem": r"gpgpu_n_param_mem_insn\s*=\s*(\d+)",
    "tex": r"gpgpu_n_tex_insn\s*=\s*(\d+)",
    "mem_read_global": r"gpgpu_n_mem_read_global\s*=\s*(\d+)",
    "mem_write_global": r"gpgpu_n_mem_write_global\s*=\s*(\d+)",
    "shmem_bkconflict": r"gpgpu_n_shmem_bkconflict\s*=\s*(\d+)",
    "l1cache_bkconflict": r"gpgpu_n_l1cache_bkconflict\s*=\s*(\d+)",
}
_STALL_FIELDS = {
    "gl_mem_resource": r"gpgpu_stall_shd_mem\[gl_mem\]\[resource_stall\]\s*=\s*(\d+)",
    "gl_mem_coal": r"gpgpu_stall_shd_mem\[gl_mem\]\[coal_stall\]\s*=\s*(\d+)",
    "gl_mem_data_port": r"gpgpu_stall_shd_mem\[gl_mem\]\[data_port_stall\]\s*=\s*(\d+)",
    "c_mem_resource": r"gpgpu_stall_shd_mem\[c_mem\]\[resource_stall\]\s*=\s*(\d+)",
    "s_mem_bkconf": r"gpgpu_stall_shd_mem\[s_mem\]\[bk_conf\]\s*=\s*(\d+)",
    "icnt2sh": r"gpu_stall_icnt2sh\s*=\s*(\d+)",
    "reg_bank_conflict": r"gpu_reg_bank_conflict_stalls\s*=\s*(\d+)",
}
_DRAM_BOTTLENECKS = {
    "rcd": r"RCDc_limit\s*=\s*(\d+)",
    "rcdwr": r"RCDWRc_limit\s*=\s*(\d+)",
    "wtr": r"WTRc_limit\s*=\s*(\d+)",
    "rtw": r"RTWc_limit\s*=\s*(\d+)",
    "ccdl": r"CCDLc_limit\s*=\s*(\d+)",
}
_LAT_SCALARS = {
    "max_mf": r"maxmflatency\s*=\s*(\d+)",
    "avg_mf": r"averagemflatency\s*=\s*(\d+)",
    "max_icnt2mem": r"max_icnt2mem_latency\s*=\s*(\d+)",
    "max_mrq": r"maxmrqlatency\s*=\s*(\d+)",
    "max_icnt2sh": r"max_icnt2sh_latency\s*=\s*(\d+)",
    "avg_icnt2mem": r"avg_icnt2mem_latency\s*=\s*(\d+)",
    "avg_mrq": r"avg_mrq_latency\s*=\s*(\d+)",
    "avg_icnt2sh": r"avg_icnt2sh_latency\s*=\s*(\d+)",
}
_LAT_TABLES = ["mf_lat_table", "mrq_lat_table", "icnt2mem_lat_table", "icnt2sh_lat_table"]


def _last_int(pat: str, text: str) -> Optional[int]:
    m = re.findall(pat, text)
    return int(m[-1]) if m else None


def _last_float(pat: str, text: str) -> Optional[float]:
    m = re.findall(pat, text)
    return float(m[-1]) if m else None


def _avg_float(pat: str, text: str) -> Optional[float]:
    m = [float(x) for x in re.findall(pat, text)]
    return round(sum(m) / len(m), 4) if m else None


def _sum_int(pat: str, text: str) -> Optional[int]:
    m = [int(x) for x in re.findall(pat, text)]
    return sum(m) if m else None


def _parse_kernels(text: str) -> List[KernelStat]:
    kernels = []
    # each kernel block starts at "kernel_name ="
    chunks = text.split("kernel_name =")[1:]
    for chunk in chunks:
        name = chunk.splitlines()[0].strip()
        occ = re.search(r"gpu_occupancy\s*=\s*([\d.]+)%", chunk)
        kernels.append(
            KernelStat(
                name=name,
                launch_uid=_first_int(r"kernel_launch_uid\s*=\s*(\d+)", chunk),
                cycles=_first_int(r"gpu_sim_cycle\s*=\s*(\d+)", chunk),
                insn=_first_int(r"gpu_sim_insn\s*=\s*(\d+)", chunk),
                ipc=_first_float(r"gpu_ipc\s*=\s*([\d.]+)", chunk),
                occupancy=round(float(occ.group(1)) / 100.0, 4) if occ else None,
            )
        )
    return kernels


def _first_int(pat: str, text: str) -> Optional[int]:
    m = re.search(pat, text)
    return int(m.group(1)) if m else None


def _first_float(pat: str, text: str) -> Optional[float]:
    m = re.search(pat, text)
    return float(m.group(1)) if m else None


def _parse_per_sm_l1d(text: str) -> List[CoreCacheStat]:
    # repeats per kernel; keep the last occurrence per core index (final cumulative)
    by_core: Dict[int, CoreCacheStat] = {}
    pat = re.compile(
        r"L1D_cache_core\[(\d+)\]:\s*Access\s*=\s*(\d+),\s*Miss\s*=\s*(\d+),\s*"
        r"Miss_rate\s*=\s*([\d.]+),\s*Pending_hits\s*=\s*\d+,\s*Reservation_fails\s*=\s*(\d+)"
    )
    for m in pat.finditer(text):
        core = int(m.group(1))
        by_core[core] = CoreCacheStat(
            core=core,
            accesses=int(m.group(2)),
            misses=int(m.group(3)),
            miss_rate=float(m.group(4)),
            reservation_fails=int(m.group(5)),
        )
    return [by_core[c] for c in sorted(by_core)]


def _parse_cache_by_type(text: str) -> Dict[str, Dict[str, int]]:
    out: Dict[str, Dict[str, int]] = {}
    for t in _CACHE_TYPES:
        hit = _last_int(rf"Total_core_cache_stats_breakdown\[{t}\]\[HIT\]\s*=\s*(\d+)", text)
        miss = _last_int(rf"Total_core_cache_stats_breakdown\[{t}\]\[MISS\]\s*=\s*(\d+)", text)
        if hit is not None or miss is not None:
            out[t] = {"hit": hit or 0, "miss": miss or 0}
    return out


def _parse_traffic(text: str, direction: str) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for m in re.finditer(
        rf"traffic_breakdown_{direction}\[(\w+)\]\s*=\s*(\d+)", text
    ):
        out[m.group(1)] = int(m.group(2))  # later (cumulative) overwrites earlier
    return out


def _parse_warp(text: str) -> Dict[str, object]:
    out: Dict[str, object] = {}
    m = re.findall(r"Stall:(\d+)\s+W0_Idle:(\d+)\s+W0_Scoreboard:(\d+)", text)
    if m:
        stall, idle, scoreboard = (int(x) for x in m[-1])
        out.update(stall=stall, idle=idle, scoreboard=scoreboard)
    issued = _last_int(r"\sW32:(\d+)", text)
    if issued is not None:
        out["issued"] = issued
    si = re.findall(r"single_issue_nums:\s*WS0:(\d+)\s+WS1:(\d+)", text)
    if si:
        out["single_issue"] = sum(int(x) for x in si[-1])
    di = re.findall(r"dual_issue_nums:\s*WS0:(\d+)\s+WS1:(\d+)", text)
    if di:
        out["dual_issue"] = sum(int(x) for x in di[-1])
    return out


def _parse_latency(text: str) -> Dict[str, object]:
    out: Dict[str, object] = {}
    for key, pat in _LAT_SCALARS.items():
        v = _last_int(pat, text)
        if v is not None:
            out[key] = v
    for name in _LAT_TABLES:
        m = re.findall(rf"{name}:([\d \t]+)", text)
        if m:
            out[name] = [int(x) for x in m[-1].split()]
    return out


def _parse_dram(text: str) -> Dict[str, object]:
    out: Dict[str, object] = {}
    rbl = _avg_float(r"Row_Buffer_Locality\s*=\s*([\d.]+)", text)
    blp = _avg_float(r"Bank_Level_Parallism\s*=\s*([\d.]+)", text)
    bw = _avg_float(r"bw_util=([\d.]+)", text)
    eff = _avg_float(r"dram_eff=([\d.]+)", text)
    if rbl is not None:
        out["row_buffer_locality"] = rbl
    if blp is not None:
        out["bank_level_parallelism"] = blp
    if bw is not None:
        out["bw_util"] = bw
    if eff is not None:
        out["dram_eff"] = eff
    bottlenecks = {k: _sum_int(p, text) for k, p in _DRAM_BOTTLENECKS.items()}
    bottlenecks = {k: v for k, v in bottlenecks.items() if v is not None}
    if bottlenecks:
        out["bottlenecks"] = bottlenecks
    return out


def _parse_dict(fields: Dict[str, str], text: str) -> Dict[str, int]:
    out = {}
    for key, pat in fields.items():
        v = _last_int(pat, text)
        if v is not None:
            out[key] = v
    return out


def parse_report(output: str) -> SimReport:
    """Extract the rich structured profile from raw GPGPU-Sim stdout."""
    return SimReport(
        kernels=_parse_kernels(output),
        per_sm_l1d=_parse_per_sm_l1d(output),
        cache_by_type=_parse_cache_by_type(output),
        traffic_coretomem=_parse_traffic(output, "coretomem"),
        traffic_memtocore=_parse_traffic(output, "memtocore"),
        warp=_parse_warp(output),
        latency=_parse_latency(output),
        dram=_parse_dram(output),
        instr_mix=_parse_dict(_INSTR_FIELDS, output),
        stalls=_parse_dict(_STALL_FIELDS, output),
    )
