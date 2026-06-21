"""Send one test error to Sentry to confirm the integration works.

Run (in the venv, with SENTRY_DSN in .env):
    python tests/monitoring/test_sentry_smoke.py

Then open your Sentry project -> Issues. You should see a RuntimeError titled
"SproutSource Sentry smoke test". Sentry ingests over HTTPS/443, so this works
even on restricted WiFi.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from backend import monitoring


def main():
    enabled = monitoring.init_sentry()
    print("Sentry enabled:", enabled)
    if not enabled:
        print("-> SENTRY_DSN not set, or sentry-sdk not installed. Nothing sent.")
        return 1

    try:
        raise RuntimeError("SproutSource Sentry smoke test — safe to ignore")
    except RuntimeError as exc:
        monitoring.capture_exception(exc, source="sentry_smoke_test")

    import sentry_sdk

    sentry_sdk.flush(timeout=5)  # events send async — force-flush before exit
    print("Sent a test error to Sentry. Check your project's Issues feed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
