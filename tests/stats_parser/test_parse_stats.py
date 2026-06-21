"""Parse the REAL sample output and verify every field — no Docker needed.

Run directly:   python tests/stats_parser/test_parse_stats.py
Or via pytest:  pytest tests/stats_parser/test_parse_stats.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.stats_parser import is_success, parse_stats

SAMPLE = (ROOT / "sample" / "out.txt").read_text()


def _approx(a, b, tol=1e-6):
    return a is not None and abs(a - b) < tol


def test_headline_fields():
    s = parse_stats(SAMPLE)
    assert _approx(s.ipc, 315.2309)
    assert s.total_insn == 18710528
    assert s.total_cycles == 59355


def test_occupancy_is_fraction():
    s = parse_stats(SAMPLE)
    assert _approx(s.occupancy, 0.3241)  # 32.4137% -> 0.3241


def test_hit_rates_are_one_minus_miss():
    s = parse_stats(SAMPLE)
    assert _approx(s.l1_hit_rate, 1 - 0.5417)
    assert _approx(s.l2_hit_rate, 1 - 0.3010)
    assert _approx(s.l1i_hit_rate, 1 - 0.0161)


def test_uses_l2_bw_total_not_per_partition():
    s = parse_stats(SAMPLE)
    # final L2_BW_total is 82.2801 (the per-partition L2_BW is 108.83 — must NOT win)
    assert _approx(s.l2_bw, 82.2801)


def test_stall_counts():
    s = parse_stats(SAMPLE)
    assert s.dram_stalls == 876
    assert s.shmem_stalls == 49638


def test_sim_time_parsed_to_seconds():
    s = parse_stats(SAMPLE)
    assert s.sim_time_sec == 21


def test_takes_last_occurrence_of_ipc():
    # two stat dumps in the sample; the final one (315.2309) must win
    assert parse_stats(SAMPLE).ipc == 315.2309


def test_missing_fields_return_none_not_crash():
    s = parse_stats("garbage with no stats at all")
    assert s.ipc is None and s.l1_hit_rate is None and s.sim_time_sec is None


def test_is_success():
    assert is_success(SAMPLE) is True
    assert is_success("no marker here") is False


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
