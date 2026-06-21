"""Redis-backed ExperimentStore (sponsor: Redis).

Implements the SAME interface as InMemoryExperimentStore, so the runner and
everything above it are unchanged — just inject this instead. Layout:
  * `exp:{exp_id}`  -> a Redis HASH with the experiment fields. Nested config
    and stats are stored as JSON strings (hash values must be scalars).
  * `experiments:index` -> a sorted set (score = timestamp) so get_all()
    returns experiments in chronological order without scanning.

Connect with a REDIS_URL (see .env.example):
    store = RedisExperimentStore.from_env()        # reads REDIS_URL
    store = RedisExperimentStore("redis://...")     # explicit
"""

import json
import os
from typing import List, Optional

from .models import Experiment

INDEX_KEY = "experiments:index"


def _key(exp_id: str) -> str:
    return f"exp:{exp_id}"


class RedisExperimentStore:
    def __init__(self, url: str):
        import redis  # imported lazily so the package works without redis installed

        # Fail fast instead of hanging forever on a bad/blocked connection
        # (the usual culprit is redis:// vs rediss:// TLS mismatch).
        self.client = redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )

    @classmethod
    def from_env(cls) -> "RedisExperimentStore":
        url = os.environ.get("REDIS_URL")
        if not url:
            raise RuntimeError("REDIS_URL is not set (see .env.example)")
        return cls(url)

    def ping(self) -> bool:
        return bool(self.client.ping())

    def save(self, exp: Experiment) -> None:
        mapping = {
            "exp_id": exp.exp_id,
            "benchmark": exp.benchmark,
            "container_id": exp.container_id,
            "timestamp": exp.timestamp,
            "status": exp.status,
            "error": exp.error or "",
            "log_path": exp.log_path or "",
            "config": json.dumps(exp.config.to_dict()),
            "stats": json.dumps(exp.stats.to_dict()),
        }
        self.client.hset(_key(exp.exp_id), mapping=mapping)
        self.client.zadd(INDEX_KEY, {exp.exp_id: exp.timestamp})

    def get(self, exp_id: str) -> Optional[Experiment]:
        d = self.client.hgetall(_key(exp_id))
        return self._from_hash(d) if d else None

    def get_all(self) -> List[Experiment]:
        ids = self.client.zrange(INDEX_KEY, 0, -1)
        out = []
        for exp_id in ids:
            exp = self.get(exp_id)
            if exp is not None:
                out.append(exp)
        return out

    @staticmethod
    def _from_hash(d: dict) -> Experiment:
        return Experiment.from_dict(
            {
                "exp_id": d["exp_id"],
                "config": json.loads(d["config"]),
                "stats": json.loads(d["stats"]),
                "benchmark": d["benchmark"],
                "container_id": d["container_id"],
                "timestamp": float(d["timestamp"]),
                "status": d.get("status", "success"),
                "error": d.get("error") or None,
                "log_path": d.get("log_path") or None,
            }
        )
