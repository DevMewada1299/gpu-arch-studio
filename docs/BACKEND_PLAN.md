# Backend Build Plan — Person 1 (Docker + Simulation Pipeline)

> You own the highest-risk, highest-importance module. Everything depends on
> this working. Build and test it FIRST. If Docker automation breaks, it
> breaks here — and you want to know early.

## Your Goal

A Python pipeline that: takes a GPU config → writes a `gpgpusim.config` file
→ runs the simulation inside a Docker container → parses the output stats →
returns structured JSON. Reliably. Handling failures.

## Build Order (do these in sequence)

### Step 1 — Talk to Docker from Python (1.5 hrs)

Install: `pip install docker fastapi uvicorn redis "redis[hiredis]"`

Write `docker_manager.py`:
- `get_containers()` — list running containers with label `gpgpu-sim=true`
- `exec_in_container(container_id, cmd)` — run a command, capture output

**Test immediately:** can you run `ls` inside your GPGPU-Sim container from
Python and see the output? If yes, the foundation works. If not, fix this
before anything else — check the label, check the container is running.

### Step 2 — Generate config files (1.5 hrs)

Write `config_generator.py`:
- `generate_config(params: dict) -> str` — produces a valid gpgpusim.config
- Start from your KNOWN-WORKING config as a template
- Only substitute the 7 parameters from CLAUDE.md
- Everything else stays exactly as your working config

**Critical:** take the config that ALREADY WORKS in your Docker setup and
template only the params you're changing. Don't write a config from scratch.

**Test:** generate a config with default params, diff it against your known
working config — only the intended fields should differ.

### Step 3 — Run a simulation end to end (2 hrs)

Write the runner in `docker_manager.py`:
- Write config to `./experiments/{exp_id}/gpgpusim.config`
- Exec the benchmark inside the container pointing at that experiment dir
- Stream output line by line (you'll need this for the live UI later)
- Save full output to `./experiments/{exp_id}/output.log`

**Test:** run GEMM with default config. Does it complete? Do you get the same
output you get when you run it manually? This is the make-or-break test.

**Add the speed flag:** use `-gpgpu_max_insn 100000` (or similar) for a "fast
mode" that finishes in ~30s instead of minutes. Verify it still produces
meaningful (not necessarily converged) stats.

### Step 4 — Parse the stats (1.5 hrs)

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
