"""Verify the rich SimReport parser against the REAL sample output. No Docker.

Run directly:   python tests/report_parser/test_parse_report.py
Or via pytest:  pytest tests/report_parser/test_parse_report.py
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.report_parser import parse_report

REPORT = parse_report((ROOT / "sample" / "out.txt").read_text())


def test_per_kernel():
    assert len(REPORT.kernels) == 2
    k0 = REPORT.kernels[0]
    assert k0.name == "_Z14CUDAkernel2DCTPfi"
    assert k0.ipc == 263.9486
    assert k0.occupancy == 0.302
    assert REPORT.kernels[1].name == "_Z27CUDAkernelQuantizationFloatPfi"


def test_per_sm_l1d_heatmap():
    assert len(REPORT.per_sm_l1d) == 15  # 15 SMs
    assert REPORT.per_sm_l1d[0].core == 0
    assert REPORT.per_sm_l1d[0].miss_rate == 0.539


def test_cache_by_type():
    assert REPORT.cache_by_type["GLOBAL_ACC_W"] == {"hit": 34372, "miss": 6588}
    assert REPORT.cache_by_type["GLOBAL_ACC_R"]["miss"] == 37792


def test_traffic_breakdown():
    assert REPORT.traffic_coretomem["GLOBAL_ACC_W"] == 2424832
    assert REPORT.traffic_memtocore["GLOBAL_ACC_R"] == 6046720


def test_warp_distribution():
    assert REPORT.warp["scoreboard"] == 995192  # the dominant stall reason
    assert REPORT.warp["single_issue"] == 592896
    assert REPORT.warp["dual_issue"] == 0


def test_latency_scalars_and_histograms():
    assert REPORT.latency["max_mf"] == 693
    assert REPORT.latency["avg_mf"] == 264
    assert len(REPORT.latency["mf_lat_table"]) == 32
    assert len(REPORT.latency["icnt2mem_lat_table"]) == 24


def test_dram_bottlenecks():
    d = REPORT.dram
    assert d["row_buffer_locality"] == 0.9547
    assert 0 < d["bw_util"] < 1
    # CCDL + RTW dominate the wasted bandwidth (summed across 6 partitions)
    assert d["bottlenecks"]["ccdl"] == 78524
    assert d["bottlenecks"]["rtw"] == 56907


def test_instruction_mix():
    assert REPORT.instr_mix["shmem"] == 1572864  # DCT is shared-memory heavy
    assert REPORT.instr_mix["load"] == 524288


def test_stall_breakdown():
    assert REPORT.stalls["gl_mem_coal"] == 49152
    assert REPORT.stalls["icnt2sh"] == 6131


def test_empty_input_no_crash():
    empty = parse_report("nothing useful here")
    assert empty.kernels == []
    assert empty.per_sm_l1d == []
    assert empty.dram == {}


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
