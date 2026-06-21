"""Agent memory — vector recall of past experiments for the orchestrator.

This is the Redis "beyond caching" piece. After each experiment we store a
memory (config + stats + bottleneck classification); before each proposal the
orchestrator semantically retrieves the most relevant PAST experiments and
folds them into its reasoning. Vector search + context retrieval + agent memory.

Same drop-in shape as ExperimentStore:
  * InMemoryAgentMemory — zero deps, works now, used for dev/tests/fallback.
  * RedisVLAgentMemory  — real RedisVL vector index (the prize path); activates
    when REDIS_URL is set and `redisvl` + a sentence-transformers model are
    installed.

make_agent_memory() picks RedisVL if available, else in-memory.
"""

import hashlib
import json
import math
import os
import re
from typing import List, Optional, Protocol


# --- interface ------------------------------------------------------------

class AgentMemory(Protocol):
    def remember(self, exp_id: str, text: str, metadata: Optional[dict] = None) -> None: ...
    def recall(self, query: str, k: int = 3) -> List[dict]: ...
    def count(self) -> int: ...


def memory_text(exp, analysis: Optional[dict] = None) -> str:
    """A compact natural-language memory of one experiment for embedding/recall."""
    c, s = exp.config, exp.stats
    bott = (analysis or {}).get("bottleneck")
    classification = bott.text.splitlines()[0].strip(" #*") if bott and bott.text else ""
    return (
        f"clusters={c.n_clusters} cores={c.cores_per_cluster} n_mem={c.n_mem} "
        f"shmem={c.shmem_size} scheduler={c.scheduler} l1_sets={c.l1_sets} "
        f"l2_sets={c.l2_sets} -> ipc={s.ipc} occupancy={s.occupancy} "
        f"l1_hit={s.l1_hit_rate} l2_hit={s.l2_hit_rate} dram_stalls={s.dram_stalls}. "
        f"bottleneck: {classification}"
    )


# --- in-memory (no deps) --------------------------------------------------

def _hash_embed(text: str, dim: int = 256) -> List[float]:
    """Deterministic bag-of-words hashing embedding — no model needed.

    Good enough to prove recall (identical text -> identical vector; shared
    tokens -> higher cosine). RedisVLAgentMemory uses real sentence embeddings.
    """
    vec = [0.0] * dim
    for tok in re.findall(r"[a-z0-9_]+", text.lower()):
        idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


def _cosine(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))  # inputs are unit-normalized


class InMemoryAgentMemory:
    def __init__(self, embed_fn=None):
        self._items: List[dict] = []
        self._embed = embed_fn or _hash_embed

    def remember(self, exp_id: str, text: str, metadata: Optional[dict] = None) -> None:
        self._items.append(
            {"exp_id": exp_id, "text": text, "metadata": metadata or {},
             "vec": self._embed(text)}
        )

    def recall(self, query: str, k: int = 3) -> List[dict]:
        if not self._items:
            return []
        qv = self._embed(query)
        scored = sorted(
            self._items, key=lambda it: _cosine(qv, it["vec"]), reverse=True
        )
        return [
            {"exp_id": it["exp_id"], "text": it["text"],
             "metadata": it["metadata"], "score": round(_cosine(qv, it["vec"]), 4)}
            for it in scored[:k]
        ]

    def count(self) -> int:
        return len(self._items)


# --- RedisVL (the prize path) ---------------------------------------------

class RedisVLAgentMemory:
    """Real vector memory in Redis via RedisVL + local sentence-transformers.

    NOTE: redisvl's API varies across versions — if a binding here mismatches
    your installed redisvl, that's the spot to adjust. Verified shape targets
    redisvl >= 0.3.
    """

    INDEX_NAME = "agent_memory"

    def __init__(self, url: str, model: str = "sentence-transformers/all-MiniLM-L6-v2"):
        from redisvl.index import SearchIndex
        from redisvl.query import VectorQuery
        from redisvl.schema import IndexSchema
        from redisvl.utils.vectorize import HFTextVectorizer

        self._vectorizer = HFTextVectorizer(model=model)
        self._VectorQuery = VectorQuery
        dims = self._vectorizer.dims

        schema = IndexSchema.from_dict({
            "index": {"name": self.INDEX_NAME, "prefix": "amem", "storage_type": "hash"},
            "fields": [
                {"name": "exp_id", "type": "tag"},
                {"name": "text", "type": "text"},
                {"name": "metadata", "type": "text"},
                {"name": "embedding", "type": "vector", "attrs": {
                    "dims": dims, "distance_metric": "cosine",
                    "algorithm": "flat", "datatype": "float32"}},
            ],
        })
        self._index = SearchIndex(schema, redis_url=url)
        self._index.create(overwrite=False)  # no-op if it already exists

    def remember(self, exp_id: str, text: str, metadata: Optional[dict] = None) -> None:
        emb = self._vectorizer.embed(text, as_buffer=True, dtype="float32")
        self._index.load([{
            "exp_id": exp_id, "text": text,
            "metadata": json.dumps(metadata or {}), "embedding": emb,
        }])

    def recall(self, query: str, k: int = 3) -> List[dict]:
        qv = self._vectorizer.embed(query)
        vq = self._VectorQuery(
            vector=qv, vector_field_name="embedding", num_results=k,
            return_fields=["exp_id", "text", "metadata"],
        )
        out = []
        for r in self._index.query(vq):
            out.append({
                "exp_id": r.get("exp_id"),
                "text": r.get("text"),
                "metadata": json.loads(r.get("metadata", "{}")),
                "score": round(1.0 - float(r.get("vector_distance", 1.0)), 4),
            })
        return out

    def count(self) -> int:
        return self._index.info().get("num_docs", 0)


def make_agent_memory() -> AgentMemory:
    url = os.environ.get("REDIS_URL")
    if url:
        try:
            import redisvl  # noqa: F401

            mem = RedisVLAgentMemory(url)
            print("[memory] using RedisVL vector memory")
            return mem
        except Exception as exc:  # noqa: BLE001
            print(f"[memory] RedisVL unavailable ({exc}); using in-memory vector memory")
    print("[memory] using in-memory vector memory")
    return InMemoryAgentMemory()
