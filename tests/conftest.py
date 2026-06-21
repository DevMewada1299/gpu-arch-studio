"""Pytest bootstrap: put the repo root on sys.path so `import backend...` works."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
