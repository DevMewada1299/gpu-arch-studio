# Tests

Integration smoke tests for the backend. These are **not** pure unit tests —
they require a running GPGPU-Sim Docker container (default name `relaxed_shaw`,
override with the `GPGPU_CONTAINER` env var).

Each test file is both pytest-compatible and directly runnable:

```bash
# Run everything with pytest
pytest tests/

# Or run a single test script directly (prints PASS/FAIL)
python tests/docker_manager/test_get_containers.py
```

## Layout

One subfolder per backend module under test:

```
tests/
  conftest.py                  # puts repo root on sys.path
  docker_manager/              # needs a running container (uses docker SDK)
    test_get_containers.py     # container discovery
    test_exec_basic.py         # exec primitives: echo, workdir, streaming
    test_run_benchmark.py      # end-to-end JPEG sim run (the make-or-break test)
  config_generator/            # pure unit tests, no Docker needed
    test_generate_config.py    # templating, cache SETS, interconnect sizing
```

`config_generator` tests are pure Python and run with any interpreter.
`docker_manager` tests need the venv (docker SDK) and a running container.

As new backend modules land (`stats_parser`, `experiment_manager`), add a
matching subfolder here.
