"""Round-trip an Experiment through Redis. Skips if REDIS_URL is not set.

Run directly:   python tests/redis_store/test_redis_store.py
Or via pytest:  pytest tests/redis_store/test_redis_store.py

Needs the venv (redis package) and REDIS_URL pointing at a reachable Redis.
"""
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from backend.models import Experiment, GPUConfig, SimStats

HAVE_REDIS = bool(os.environ.get("REDIS_URL"))


def _sample_experiment() -> Experiment:
    return Experiment(
        exp_id="test_rt01",
        config=GPUConfig(n_clusters=30, l1_sets=64),
        stats=SimStats(ipc=456.58, l1_hit_rate=0.41, occupancy=0.3),
        benchmark="dct8x8",
        container_id="relaxed_shaw",
        timestamp=1234567890.0,
        status="success",
    )


def test_round_trip():
    if not HAVE_REDIS:
        print("SKIP: REDIS_URL not set")
        return
    from backend.redis_store import RedisExperimentStore

    store = RedisExperimentStore.from_env()
    assert store.ping()

    exp = _sample_experiment()
    store.save(exp)

    got = store.get(exp.exp_id)
    assert got is not None
    assert got.config.n_clusters == 30
    assert got.config.l1_sets == 64
    assert abs(got.stats.ipc - 456.58) < 1e-6
    assert got.status == "success"
    assert got.error is None  # empty string round-trips back to None

    assert any(e.exp_id == exp.exp_id for e in store.get_all())

    # cleanup
    store.client.delete(f"exp:{exp.exp_id}")
    store.client.zrem("experiments:index", exp.exp_id)
    print("PASS: test_round_trip")


if __name__ == "__main__":
    test_round_trip()
