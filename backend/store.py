"""Experiment persistence behind a tiny interface.

The runner depends on this interface, NOT on Redis directly. That keeps the
pipeline runnable/testable without a Redis server and makes Redis a drop-in:
`redis_store.RedisExperimentStore` will implement the same three methods later
(keys `exp:{exp_id}` as hashes, per CLAUDE.md). The in-memory impl also serves
as the demo fallback if Redis is unavailable mid-demo.
"""

from typing import Dict, List, Optional, Protocol

from .models import Experiment, SimReport


class ExperimentStore(Protocol):
    def save(self, exp: Experiment) -> None: ...
    def get(self, exp_id: str) -> Optional[Experiment]: ...
    def get_all(self) -> List[Experiment]: ...
    # rich profile (heavy tier) kept separate from the light Experiment record
    def save_report(self, exp_id: str, report: SimReport) -> None: ...
    def get_report(self, exp_id: str) -> Optional[SimReport]: ...


class InMemoryExperimentStore:
    """Dict-backed store. Insertion order preserved for history display."""

    def __init__(self) -> None:
        self._data: Dict[str, Experiment] = {}
        self._reports: Dict[str, SimReport] = {}

    def save(self, exp: Experiment) -> None:
        self._data[exp.exp_id] = exp

    def get(self, exp_id: str) -> Optional[Experiment]:
        return self._data.get(exp_id)

    def get_all(self) -> List[Experiment]:
        return list(self._data.values())

    def save_report(self, exp_id: str, report: SimReport) -> None:
        self._reports[exp_id] = report

    def get_report(self, exp_id: str) -> Optional[SimReport]:
        return self._reports.get(exp_id)
