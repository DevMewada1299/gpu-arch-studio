# Backend Build Plan — Person 1 (Docker + Simulation Pipeline)

> You own the highest-risk, highest-importance module. Everything depends on
> this working. Build and test it FIRST. If Docker automation breaks, it
> breaks here — and you want to know early.

## Your Goal

A Python pipeline that: takes a GPU config → writes a `gpgpusim.config` file
→ runs the simulation inside a Docker container → parses the output stats →
returns structured JSON. Reliably. Handling failures.

## Reality Notes (discovered while building — read before Step 2/3)

The live container (`relaxed_shaw`, image `my-ubuntu-12.04`) does NOT match a
few assumptions in this plan. None of this affects the frontend — it's all
behind the API contract — but it changes how the runner is built:

1. **No `gpgpu-sim=true` label.** The container has no labels. `get_containers()`
   discovers by label but falls back to the container NAME (`relaxed_shaw`,
   override via the `GPGPU_CONTAINER` env var). Relabel later by recreating the
   container if we want pure label discovery.

2. **No `./experiments:/experiments` volume mount.** The container has zero
   mounts, so the "write config to host `./experiments/{exp_id}/` and read it
   through a shared volume" approach in Step 3 will NOT work as written. Plan:
   write the generated config INTO the container per run (`put_archive` /
   `docker cp`) at `/tmp/benchmarks/JPEG/gpgpusim.config`. Less disruptive than
   recreating the container with a mount.

3. **The benchmark reads `gpgpusim.config` from its CWD** (`/tmp/benchmarks/JPEG`),
   not a per-experiment dir. So runs are serial by default (overwrite the one
   config per run). For parallel runs we'd copy the whole JPEG dir per
   experiment — defer until the multi-container step.

5. **n_clusters / n_mem require a matching interconnect file.** The
   `config_fermi_islip.icnt` is a `fly` crossbar with a fixed node count
   `k = n_clusters + n_mem*2` (baseline 15 + 6*2 = 27). Change n_clusters or
   n_mem WITHOUT updating `k` and the sim SEGFAULTS at kernel launch (verified:
   30 clusters with k=27 → segfault; with k=42 → SUCCESS, IPC 315→457).
   `config_generator.generate_files()` emits BOTH files so they can't drift —
   the runner must write both into `/tmp/benchmarks/JPEG`.

4. **GPGPU-Sim env setup is load-bearing** (codified as `ENV_PREAMBLE` in
   `docker_manager.py`). Before any benchmark: export
   `CUDA_INSTALL_PATH=/opt/cuda-installers/toolkitcuda42/cuda`, source
   `/opt/gpgpu-sim_distribution/setup_environment`, THEN override
   `LD_LIBRARY_PATH` to `.../lib/gcc-4.5.1/cuda-4020/release`. The setup script
   auto-derives a `gcc-4.6.3` path (the container's gcc) but the libs were built
   with gcc-4.5.1, so the auto path is empty and the benchmark fails with
   `libcudart.so.4: cannot open shared object file`.

## Build Order (do these in sequence)

### Step 1 — Talk to Docker from Python (1.5 hrs) — DONE

Install: `pip install docker fastapi uvicorn redis "redis[hiredis]"`

Built in `backend/docker_manager.py`:
- `get_containers()` — label discovery + name fallback (see Reality Note 1)
- `exec_in_container(container, cmd, with_env, workdir)` → `(exit_code, output)`
- `stream_in_container(...)` — yields output line by line (for the live UI)
- `ENV_PREAMBLE` — the env fix from Reality Note 4

Tested in `tests/docker_manager/` (discovery, exec primitives, full JPEG run).
All passing against the real container.

### Step 1 (original notes) — Talk to Docker from Python (1.5 hrs)

Install: `pip install docker fastapi uvicorn redis "redis[hiredis]"`

Write `docker_manager.py`:
- `get_containers()` — list running containers with label `gpgpu-sim=true`
- `exec_in_container(container_id, cmd)` — run a command, capture output

**Test immediately:** can you run `ls` inside your GPGPU-Sim container from
Python and see the output? If yes, the foundation works. If not, fix this
before anything else — check the label, check the container is running.

### Step 2 — Generate config files (1.5 hrs) — DONE

Built in `backend/config_generator.py` (templates in `backend/templates/`):
- `generate_config(params)` — rewrites only the 8 tunable lines off the exact
  working config; cache params edit only the SETS field of the format string.
- `generate_icnt(params)` + `generate_files(params)` — emits a matching
  interconnect file (see Reality Note 5) so n_clusters/n_mem can vary safely.
- Validation: unknown params and bad scheduler values raise.
- Demo-verified end to end: generated 30-cluster config ran in the container,
  IPC 315 → 457. Unit tests in `tests/config_generator/` (16 passing).

Original notes:

Write `config_generator.py`:
- `generate_config(params: dict) -> str` — produces a valid gpgpusim.config
- Start from your KNOWN-WORKING config as a template
- Only substitute the 7 parameters from CLAUDE.md
- Everything else stays exactly as your working config

**Critical:** take the config that ALREADY WORKS in your Docker setup and
template only the params you're changing. Don't write a config from scratch.

**Test:** generate a config with default params, diff it against your known
working config — only the intended fields should differ.

### Step 3 — Run a simulation end to end (2 hrs) — DONE

Built in `backend/runner.py` (runner kept SEPARATE from docker_manager for
clean layering — docker_manager stays Docker-primitives-only):
- `run_experiment(config, benchmark, container, store)` → `Experiment`
- generates config + matching interconnect, ships BOTH into the container via
  `docker_manager.put_files()` (put_archive — no shared volume), runs with the
  env preamble, parses stats, archives configs+output to `experiments/{id}/`.
- A sim failure is a RESULT (`status="error"`), never a crash; reported to
  Sentry via `monitoring`. Persistence via an injected `ExperimentStore`
  (in-memory now; Redis drop-in later).
- Supporting modules: `models.py` (GPUConfig/SimStats/Experiment dataclasses,
  the shared seam), `store.py`, `monitoring.py` (optional Sentry).
- Tested end to end in `tests/runner/` (baseline + 30-cluster auto-interconnect).

Original notes:

Write the runner in `docker_manager.py`:
- ⚠️ See Reality Note 2/3: there is NO shared volume. Write the config INTO
  the container at `/tmp/benchmarks/JPEG/gpgpusim.config` (`put_archive`),
  not to a host `./experiments/{exp_id}/` dir.
- (original, volume-based plan) Write config to `./experiments/{exp_id}/gpgpusim.config`
- Exec the benchmark inside the container pointing at that experiment dir
- Stream output line by line (you'll need this for the live UI later)
- Save full output to `./experiments/{exp_id}/output.log`

**Test:** run GEMM with default config. Does it complete? Do you get the same
output you get when you run it manually? This is the make-or-break test.

**Add the speed flag:** use `-gpgpu_max_insn 100000` (or similar) for a "fast
mode" that finishes in ~30s instead of minutes. Verify it still produces
meaningful (not necessarily converged) stats.

### Step 4 — Parse the stats (1.5 hrs) — DONE

Built in `backend/stats_parser.py` — `parse_stats(output) -> SimStats`.
Written against REAL output (`sample/out.txt`). Realities handled:
- takes the LAST occurrence of each field (stats are dumped multiple times)
- hit_rate = 1 - miss_rate; occupancy % -> fraction
- uses `L2_BW_total` (aggregate), not the per-partition `L2_BW`
- parses `gpgpu_simulation_time` human string -> seconds
- missing fields -> None (no crash)
9 unit tests in `tests/stats_parser/`, all passing.

Original notes:

Write `stats_parser.py`:
- `parse_stats(output: str) -> dict` — regex out the fields in CLAUDE.md
- Handle missing fields gracefully (return None, don't crash)

**Test:** paste real GPGPU-Sim output, verify every field extracts correctly.
GPGPU-Sim output is verbose and the exact strings matter — test against REAL
output, never against what you think the output looks like.

### Step 5 — Experiment manager + Redis (2 hrs)

Write `experiment_manager.py`:
- Job queue (asyncio)
- Container pool tracking (which are busy/idle)
- `run_experiment()` — picks an idle container, runs, stores in Redis
- Dispatching across multiple containers for parallel runs

Write `redis_store.py`:
- `save_experiment(exp)`, `get_experiment(id)`, `get_all_experiments()`
- Keys: `exp:{exp_id}` as hashes

**Test:** run 2 experiments on 2 containers simultaneously, both store correctly.

### Step 6 — FastAPI endpoints (2 hrs)

Write `main.py` with the endpoints from CLAUDE.md's API contract.
The SSE streaming endpoints are the tricky ones — use `sse-starlette`.

**Test with curl:**
```bash
curl -X POST localhost:8000/experiments/run \
  -H "Content-Type: application/json" \
  -d '{"config": {...}, "benchmark": "gemm"}'
```

## Claude Code Prompts To Use

Start Claude Code in `/backend` and use these one at a time:

```
1. "Read ../CLAUDE.md. Build docker_manager.py with get_containers()
   that lists running containers labeled gpgpu-sim=true, and
   exec_in_container() that runs a command and returns output.
   Use the docker-py SDK."

2. "Build config_generator.py. I'll paste my working gpgpusim.config.
   Template only these 7 parameters [list]. Everything else stays fixed."
   [then paste your real working config]

3. "Build the simulation runner. Write config to
   ./experiments/{exp_id}/gpgpusim.config, exec the benchmark in the
   container, stream output line by line, save to output.log."

4. "Build stats_parser.py. Here's real GPGPU-Sim output [paste it].
   Extract these fields with regex [list from CLAUDE.md]. Return a dict,
   handle missing fields by returning None."

5. "Build experiment_manager.py with an asyncio job queue, container pool
   tracking busy/idle, and run_experiment() that picks an idle container."

6. "Build main.py FastAPI app with the endpoints in CLAUDE.md. Use
   sse-starlette for the streaming endpoints."
```

## Your Definition Of Done

- Any config the frontend sends runs correctly in a container
- Stats come back as clean JSON
- Multiple containers run in parallel
- Failures don't crash the backend (sim errors return an error status)
- curl tests pass for every endpoint

## Watch Out For

- **The container needs the experiments volume mounted.** If your existing
  container doesn't have `./experiments:/experiments`, you'll need to recreate
  it with that mount, or write configs to a path that IS mounted.
- **GPGPU-Sim output format shifts** for unusual configs. Test edge cases
  (smallest and largest values of each param).
- **Don't block the event loop.** Docker exec is blocking — run it in a
  thread pool with `asyncio.to_thread()` or `run_in_executor`.
