# Master Plan — Integration, Timeline & Demo

> Read this first as a team. It ties the three modules together and gives the
> hour-by-hour plan for the 24 hours.

## The Golden Rule

Build against a CONTRACT, not against each other. The API contract and shared
types in CLAUDE.md are the seams. Person 2 (frontend) builds against mock data
matching those types. Person 3 (agents) builds against Person 1's real stats.
Nobody waits on anybody for the first ~10 hours.

## Critical Path (the one risky dependency)

```
Person 1: Docker pipeline works ──┐
                                  ├──> Person 3: agents get real stats
                                  └──> Integration: frontend gets real runs
```

Everything hinges on Person 1's Docker pipeline producing real stats. That's
why it's built and tested FIRST. Until it works, Person 3 uses sample stats
files and Person 2 uses mocks.

## Hour-By-Hour (24h, 3 people)

### Hours 0–2 — Setup (everyone together)
- Repo created, CLAUDE.md committed, everyone clones
- Everyone has Claude Code running and API keys set
- Redis running (`docker run -d -p 6379:6379 redis`)
- Person 1 confirms GPGPU-Sim container runs, grabs a REAL output sample
  and commits it to `/samples/gemm_output.log` — Person 3 needs this NOW

### Hours 2–8 — Parallel module build
- **P1:** docker_manager → config_generator → runner → stats_parser
  (by hour 8: can run a sim and get stats via a Python function)
- **P2:** scaffold → ConfigPanel → PerformanceDashboard (all on mocks)
- **P3:** agent prompts → analysis mode (using P1's committed sample output)

### Hours 8–12 — First integration
- **P1:** experiment_manager + Redis + FastAPI endpoints live
- **P2:** AgentPanel + ExperimentHistory (still mostly mocks)
- **P3:** autonomous explore() loop working against P1's pipeline
- **First end-to-end test:** frontend RUN button → real sim → real stats → UI

### Hours 12–16 — The agentic loop end to end
- **P3 + P1:** explore() runs real experiments across containers, streams
  to frontend
- **P2:** wire AgentPanel to the real SSE stream, build comparison view
- **Multi-container:** ContainerSelector picks containers, parallel runs work

### Hours 16–20 — Polish + demo mode
- DEMO_MODE: pre-run the key GEMM exploration, store in Redis, replay with
  live agent reasoning
- Visual polish pass on the dashboard and comparison view
- Sentry integration (monitor sim run failures) — sponsor prize
- Record a BACKUP DEMO VIDEO now, while it works

### Hours 20–24 — Rehearse + harden
- Run the 3-minute demo 5 times, fix what breaks
- Edge case handling (sim failure, container busy, API timeout)
- Devpost writeup, repo README, screenshots
- Final backup video

## Integration Checkpoints (don't skip)

| Hour | Checkpoint | If it fails |
|------|-----------|-------------|
| 2 | P1 has real sim output committed | All hands on Docker |
| 8 | P1 stats pipeline works as a function | Delay frontend integration |
| 12 | One real run flows to the UI | Focus everyone on the seam |
| 16 | Autonomous loop streams to UI | Fall back to analysis-only mode |
| 20 | Demo mode + backup video done | This is your insurance — don't skip |

## Fallback Ladder (if you're behind)

If time runs short, ship the highest tier you can reach:

1. **Full agentic** — autonomous loop proposes and runs experiments (target)
2. **Guided** — agents suggest the next config, user clicks to run it
3. **Analysis-only** — user runs configs, agents explain results (the wrapper)

Even tier 3 is a working demo. Don't risk having nothing by over-reaching.
Lock in tier 2 by hour 16, attempt tier 1 after.

## Sponsor Integration Checklist

- **Anthropic:** built with Claude Code (you are), agents use Claude. Mention
  both in the Devpost. Take the biggest technical swing — emphasize the
  autonomous exploration as the meaningful technical contribution.
- **Redis:** experiment store + agent memory + fast config→result lookup.
  Make this explicit, not incidental.
- **Sentry:** wrap the simulation runner — capture sim failures, config
  errors, anomalous output. "Reliability for scientific computing."
- **The Token Company:** depth of research — your Devpost should reference
  the real architecture domain (GPGPU-Sim, roofline analysis, MICRO research).

## The 3-Minute Demo Script

1. Open the studio. Load GEMM. Show the clean config panel. (15s)
2. Hit "Explore" — hand the problem to the agents. (5s)
3. Iteration 1 runs. Bottleneck agent: "memory-bandwidth bound, DRAM
   saturated." Watch the dashboard populate. (30s)
4. Orchestrator proposes: "increase L1 to 64KB, switch to GTO." It runs.
   IPC jumps. Agents explain why. (40s)
5. Two more iterations. IPC climbs. Orchestrator: "Pareto optimal for GEMM —
   diminishing returns now." (40s)
6. Open the comparison view: baseline vs final. +170% IPC. (20s)
7. Close: "This took PhD students weeks of manual config editing. The agents
   did it autonomously in minutes, and explained every decision." (30s)

## What To Have Ready As Insurance

- Pre-recorded full demo video (in case live breaks)
- Pre-computed exploration stored in Redis (demo mode)
- A screenshot deck of the key moments
- The repo clean and pushed with a clear README

## Repo Hygiene

- Commit after every working piece, push often
- `.gitignore`: node_modules, __pycache__, experiments/*/output.log, .env
- `.env.example` committed (without real keys)
- README with setup steps so judges can see it's real
