"""Sentry integration for simulation-run reliability monitoring (sponsor).

Designed to be ZERO-friction and optional:
  * If `sentry_sdk` isn't installed OR `SENTRY_DSN` isn't set, every function
    here is a safe no-op. Dev and the demo never depend on Sentry being up.
  * When a DSN is provided, init_sentry() turns it on and the runner's
    error path reports failed simulations with useful context.

To enable later, the user provides:  export SENTRY_DSN=https://...
and `pip install sentry-sdk`. No code changes required.
"""

import os
from contextlib import contextmanager
from typing import Optional

_enabled = False

try:
    import sentry_sdk  # type: ignore

    _HAVE_SDK = True
except ImportError:  # SDK not installed — stay in no-op mode
    _HAVE_SDK = False


def init_sentry(dsn: Optional[str] = None) -> bool:
    """Initialize Sentry if possible. Returns True if monitoring is active."""
    global _enabled
    dsn = dsn or os.environ.get("SENTRY_DSN")
    if not _HAVE_SDK or not dsn:
        return False
    sentry_sdk.init(dsn=dsn, traces_sample_rate=0.0)
    _enabled = True
    return True


def is_enabled() -> bool:
    return _enabled


def capture_exception(exc: BaseException, **context) -> None:
    """Report an exception with optional extra context (no-op if disabled)."""
    if not _enabled:
        return
    with sentry_sdk.push_scope() as scope:
        for key, value in context.items():
            scope.set_extra(key, value)
        sentry_sdk.capture_exception(exc)


def capture_message(message: str, level: str = "info", **context) -> None:
    if not _enabled:
        return
    with sentry_sdk.push_scope() as scope:
        for key, value in context.items():
            scope.set_extra(key, value)
        sentry_sdk.capture_message(message, level=level)


@contextmanager
def monitor_run(exp_id: str, benchmark: str, **context):
    """Wrap a simulation run so failures are reported to Sentry with context.

    Re-raises after capturing — the caller still decides how to handle it.
    """
    try:
        yield
    except Exception as exc:  # noqa: BLE001 - we re-raise
        capture_exception(exc, exp_id=exp_id, benchmark=benchmark, **context)
        raise
