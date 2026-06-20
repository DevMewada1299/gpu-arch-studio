"""Unit tests for config_generator — pure string templating, no Docker.

Core guarantee (BACKEND_PLAN Step 2): a generated config differs from the
known-working template ONLY in the intended fields.

Run directly:   python tests/config_generator/test_generate_config.py
Or via pytest:  pytest tests/config_generator/test_generate_config.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend.config_generator import (
    generate_config,
    generate_files,
    generate_icnt,
    interconnect_nodes,
    load_icnt_template,
    load_template,
)


def _diff_lines(a: str, b: str):
    """Return (line_no, old, new) for lines that differ between a and b."""
    al, bl = a.splitlines(), b.splitlines()
    assert len(al) == len(bl), "line count changed — substitution corrupted the file"
    return [(i, x, y) for i, (x, y) in enumerate(zip(al, bl)) if x != y]


def test_defaults_reproduce_template_exactly():
    assert generate_config({}) == load_template()
    assert generate_config() == load_template()


def test_single_scalar_changes_only_one_line():
    base = load_template()
    out = generate_config({"n_clusters": 30})
    diffs = _diff_lines(base, out)
    assert len(diffs) == 1, diffs
    assert "-gpgpu_n_clusters 30" in diffs[0][2]


def test_n_mem_does_not_touch_n_mem_per_ctrlr():
    out = generate_config({"n_mem": 12})
    assert "-gpgpu_n_mem 12" in out
    # the similarly-named key must be untouched
    assert "-gpgpu_n_mem_per_ctrlr 2" in out


def test_shmem_size_does_not_touch_default():
    out = generate_config({"shmem_size": 16384})
    assert "-gpgpu_shmem_size 16384" in out
    assert "-gpgpu_shmem_sizeDefault 49152" in out


def test_scheduler_two_level_uses_full_form():
    out = generate_config({"scheduler": "two_level_active"})
    assert "-gpgpu_scheduler two_level_active:6:0:1" in out


def test_l1_sets_rewrites_only_the_sets_field():
    out = generate_config({"l1_sets": 128})
    # SETS changed, rest of the format string preserved exactly
    assert "-gpgpu_cache:dl1  N:128:128:4,L:L:m:N:H,S:64:8,8" in out


def test_l2_sets_rewrites_only_the_sets_field():
    out = generate_config({"l2_sets": 32})
    assert "-gpgpu_cache:dl2 S:32:128:8,L:B:m:L:L,A:256:4,4:0,32" in out


def test_combined_changes_touch_expected_lines_only():
    base = load_template()
    out = generate_config(
        {
            "n_clusters": 30,
            "cores_per_cluster": 2,
            "n_mem": 8,
            "shmem_size": 32768,
            "scheduler": "lrr",
            "num_sched_per_core": 4,
            "l1_sets": 64,
            "l2_sets": 128,
        }
    )
    diffs = _diff_lines(base, out)
    # 8 params, each on its own line
    assert len(diffs) == 8, [d[0] for d in diffs]


def test_icnt_defaults_reproduce_template():
    assert generate_icnt({}) == load_icnt_template()


def test_interconnect_node_formula():
    # baseline: 15 clusters + 6*2 mem = 27
    assert interconnect_nodes(15, 6) == 27
    assert interconnect_nodes(30, 6) == 42
    assert interconnect_nodes(8, 4) == 16


def test_icnt_k_tracks_n_clusters():
    out = generate_icnt({"n_clusters": 30})
    assert "k = 42;" in out  # 30 + 6*2


def test_icnt_k_tracks_n_mem():
    out = generate_icnt({"n_mem": 8})
    assert "k = 31;" in out  # 15 + 8*2


def test_generate_files_returns_both_and_they_are_consistent():
    files = generate_files({"n_clusters": 30})
    assert set(files) == {"gpgpusim.config", "config_fermi_islip.icnt"}
    assert "-gpgpu_n_clusters 30" in files["gpgpusim.config"]
    assert "k = 42;" in files["config_fermi_islip.icnt"]


def test_invalid_scheduler_raises():
    try:
        generate_config({"scheduler": "rrws"})
    except ValueError:
        return
    raise AssertionError("expected ValueError for invalid scheduler")


def test_unknown_param_raises():
    try:
        generate_config({"made_up_param": 5})
    except ValueError:
        return
    raise AssertionError("expected ValueError for unknown param")


def test_non_positive_scalar_raises():
    try:
        generate_config({"n_clusters": 0})
    except ValueError:
        return
    raise AssertionError("expected ValueError for n_clusters=0")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    failures = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS: {fn.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL: {fn.__name__} — {e}")
    print("=" * 60)
    print(f"{len(tests) - failures}/{len(tests)} passed")
    sys.exit(1 if failures else 0)
