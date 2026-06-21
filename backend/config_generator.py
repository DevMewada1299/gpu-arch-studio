"""Generate a gpgpusim.config from the known-working template.

Strategy (per BACKEND_PLAN Step 2): start from the EXACT working config
(`backend/templates/gpgpusim.config`, copied byte-for-byte out of the
container) and substitute ONLY the tunable parameters. Everything else stays
identical, so any config we generate is guaranteed to be a valid GPGPU-Sim
config that differs from the proven baseline only in the intended fields.

Parameters are expressed in *config-native* terms (the values that map
directly onto config fields). These keys match the `GPUConfig` contract in
CLAUDE.md exactly, so the API layer can pass a GPUConfig straight through.

Tunable parameters (and their baseline values):

    n_clusters          -gpgpu_n_clusters            15
    cores_per_cluster   -gpgpu_n_cores_per_cluster   1
    n_mem               -gpgpu_n_mem                 6
    shmem_size          -gpgpu_shmem_size            49152   (bytes)
    scheduler           -gpgpu_scheduler             gto
    num_sched_per_core  -gpgpu_num_sched_per_core    2
    l1_sets             -gpgpu_cache:dl1  N:<SETS>:128:4     32
    l2_sets             -gpgpu_cache:dl2  S:<SETS>:128:8     64

Cache sizes are controlled via the SETS field of the cache format string:
    L1 size = sets x 128 x 4    (sets 16/32/64/128  -> 8/16/32/64 KB)
    L2 size = sets x 128 x 8    per memory sub-partition
Only the SETS field is rewritten; the rest of the format string is preserved
exactly.
"""

import os
import re
from typing import Dict

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "templates", "gpgpusim.config")
ICNT_TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__), "templates", "config_fermi_islip.icnt"
)

# The interconnect (config_fermi_islip.icnt) is a `fly` crossbar with a fixed
# node count `k`. GPGPU-Sim's interconnect node count is
#     n_clusters + n_mem * n_sub_partition_per_mchannel
# (baseline: 15 + 6*2 = 27). If n_clusters or n_mem change but k does NOT, the
# sim SEGFAULTS at kernel launch. So whenever those params change we MUST emit a
# matching .icnt with the new k. n_sub_partition_per_mchannel is not tunable
# (stays 2, as in the baseline config).
SUBPARTITIONS_PER_MCHANNEL = 2

# Baseline values — a generate_config() with no overrides reproduces the
# template unchanged.
DEFAULTS: Dict[str, object] = {
    "n_clusters": 15,
    "cores_per_cluster": 1,
    "n_mem": 6,
    "shmem_size": 49152,
    "scheduler": "gto",
    "num_sched_per_core": 2,
    "l1_sets": 32,
    "l2_sets": 64,
}

# Allowed values from CLAUDE.md. Used for validation; numeric params are also
# accepted outside this set (agents may explore) as long as they're positive
# ints, but the scheduler MUST be one of these — a bad string breaks the sim.
ALLOWED = {
    "n_clusters": {8, 15, 30, 60},
    "cores_per_cluster": {1, 2, 4},
    "n_mem": {4, 6, 8, 12},
    "shmem_size": {16384, 32768, 49152},
    "scheduler": {"gto", "lrr", "two_level_active"},
    "num_sched_per_core": {1, 2, 4},
    "l1_sets": {16, 32, 64, 128},
    "l2_sets": {32, 64, 128},
}

# The two-level scheduler needs its sub-parameters; taken from the commented
# reference line in the template (`two_level_active:6:0:1`).
_SCHEDULER_FORMS = {
    "gto": "gto",
    "lrr": "lrr",
    "two_level_active": "two_level_active:6:0:1",
}

# Scalar params: name -> config key. Cache params are handled separately.
_SCALAR_KEYS = {
    "n_clusters": "-gpgpu_n_clusters",
    "cores_per_cluster": "-gpgpu_n_cores_per_cluster",
    "n_mem": "-gpgpu_n_mem",
    "shmem_size": "-gpgpu_shmem_size",
    "num_sched_per_core": "-gpgpu_num_sched_per_core",
}


def _validate(params: Dict[str, object]) -> None:
    unknown = set(params) - set(DEFAULTS)
    if unknown:
        raise ValueError(f"unknown config params: {sorted(unknown)}")

    if "scheduler" in params and params["scheduler"] not in ALLOWED["scheduler"]:
        raise ValueError(
            f"scheduler must be one of {sorted(ALLOWED['scheduler'])}, "
            f"got {params['scheduler']!r}"
        )

    for key in (
        "n_clusters",
        "cores_per_cluster",
        "n_mem",
        "shmem_size",
        "num_sched_per_core",
        "l1_sets",
        "l2_sets",
    ):
        if key in params:
            val = params[key]
            if not isinstance(val, int) or isinstance(val, bool) or val <= 0:
                raise ValueError(f"{key} must be a positive int, got {val!r}")


def _replace_scalar(text: str, config_key: str, value: object) -> str:
    """Replace the value on the active (uncommented) line for config_key.

    Matches `<key> <value>` at line start (after optional indent). The trailing
    `\\s+` after the key prevents matching longer keys with the same prefix
    (e.g. -gpgpu_n_mem won't touch -gpgpu_n_mem_per_ctrlr).
    """
    pattern = re.compile(rf"^(\s*{re.escape(config_key)}\s+)(\S+)", re.MULTILINE)
    new_text, n = pattern.subn(rf"\g<1>{value}", text)
    if n != 1:
        raise RuntimeError(
            f"expected exactly 1 active line for {config_key}, replaced {n}"
        )
    return new_text


def _replace_cache_sets(text: str, config_key: str, new_sets: int) -> str:
    """Rewrite ONLY the SETS field of a cache format string, preserving the rest.

    e.g. `-gpgpu_cache:dl1  N:32:128:4,L:L:m:N:H,S:64:8,8`
    The first comma-group is `<sector>:<nsets>:<linesize>:<assoc>`; we replace
    nsets (index 1) and leave everything else byte-identical.
    """
    pattern = re.compile(rf"^(\s*{re.escape(config_key)}\s+)(\S+)(.*)$", re.MULTILINE)

    def _sub(m: "re.Match") -> str:
        head, value, tail = m.group(1), m.group(2), m.group(3)
        groups = value.split(",")
        fields = groups[0].split(":")  # <sector>:<nsets>:<linesize>:<assoc>
        if len(fields) < 2:
            raise RuntimeError(f"unexpected cache format for {config_key}: {value!r}")
        fields[1] = str(new_sets)
        groups[0] = ":".join(fields)
        return head + ",".join(groups) + tail

    new_text, n = pattern.subn(_sub, text)
    if n != 1:
        raise RuntimeError(
            f"expected exactly 1 active line for {config_key}, replaced {n}"
        )
    return new_text


def load_template() -> str:
    with open(TEMPLATE_PATH, "r") as f:
        return f.read()


def load_icnt_template() -> str:
    with open(ICNT_TEMPLATE_PATH, "r") as f:
        return f.read()


def interconnect_nodes(n_clusters: int, n_mem: int) -> int:
    """Number of interconnect nodes the .icnt crossbar must be sized for."""
    return n_clusters + n_mem * SUBPARTITIONS_PER_MCHANNEL


def generate_icnt(params: Dict[str, object] = None) -> str:
    """Produce a config_fermi_islip.icnt whose crossbar size matches the config.

    Rewrites the `k = <N>;` line to n_clusters + n_mem*2. Must be written
    alongside the gpgpusim.config (see generate_files) or the sim segfaults
    when n_clusters/n_mem differ from baseline.
    """
    params = dict(params or {})
    _validate(params)
    cfg = {**DEFAULTS, **params}
    k = interconnect_nodes(cfg["n_clusters"], cfg["n_mem"])

    text = load_icnt_template()
    new_text, n = re.subn(r"^(\s*k\s*=\s*)\d+(\s*;)", rf"\g<1>{k}\g<2>", text, flags=re.MULTILINE)
    if n != 1:
        raise RuntimeError(f"expected exactly 1 'k =' line in .icnt, replaced {n}")
    return new_text


def generate_files(params: Dict[str, object] = None) -> Dict[str, str]:
    """Produce all files a run needs, keyed by their in-container filename.

    The runner writes each of these into /tmp/benchmarks/JPEG. Always returns
    both files so the interconnect can never drift out of sync with the config.
    """
    return {
        "gpgpusim.config": generate_config(params),
        "config_fermi_islip.icnt": generate_icnt(params),
    }


def generate_config(params: Dict[str, object] = None) -> str:
    """Produce a valid gpgpusim.config string with the given overrides.

    Args:
        params: subset of DEFAULTS keys to override. Missing keys keep their
            baseline value (so {} reproduces the template unchanged).

    Returns the full config file contents as a string.
    """
    params = dict(params or {})
    _validate(params)

    cfg = {**DEFAULTS, **params}
    text = load_template()

    for name, config_key in _SCALAR_KEYS.items():
        text = _replace_scalar(text, config_key, cfg[name])

    text = _replace_scalar(text, "-gpgpu_scheduler", _SCHEDULER_FORMS[cfg["scheduler"]])
    text = _replace_cache_sets(text, "-gpgpu_cache:dl1", cfg["l1_sets"])
    text = _replace_cache_sets(text, "-gpgpu_cache:dl2", cfg["l2_sets"])

    return text
