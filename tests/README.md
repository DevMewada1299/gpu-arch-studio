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
  stats_parser/                # pure unit tests, no Docker needed
    test_parse_stats.py        # parses real sample/out.txt, all fields
  runner/                      # end-to-end, needs venv + container (~30-60s)
    test_run_experiment.py     # GPUConfig -> real sim -> stored Experiment
```

Pure (any interpreter): `config_generator`, `stats_parser`.
Need the venv (docker SDK) + a running container: `docker_manager`, `runner`.

As new backend modules land (`experiment_manager`, `redis_store`), add a
matching subfolder here.
