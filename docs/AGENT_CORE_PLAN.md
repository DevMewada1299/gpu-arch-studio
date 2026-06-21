# Agent Core Build Plan — Person 3 (The Agentic Engine)

> You own the part that makes this NOT a UI wrapper. The agents don't just
> explain results — they decide what experiment to run next. This is the
> novelty that wins Lab Track and the Anthropic prize. Get the autonomous
> loop working and the project is genuinely impressive.

## Your Goal

Four Claude agents that (1) analyze simulation stats with real insight, and
(2) autonomously drive an exploration loop: propose config → run → read
results → reason → propose next config → converge.

## Canonical Types & Benchmark (read first)

- The agents consume **`SimStats`** and produce/propose **`GPUConfig`** — both
  defined in CLAUDE.md. Use those exact field names. Key stats you'll reason
  over: `ipc`, `l1_hit_rate`, `l2_hit_rate`, `dram_stalls`, `occupancy`,
  `shmem_stalls`, `l2_bw`. Config params you can change: `n_clusters`,
  `cores_per_cluster`, `n_mem`, `shmem_size`, `scheduler`
  (gto/lrr/two_level_active), `num_sched_per_core`, `l1_sets`, `l2_sets`.
- Our benchmark is **DCT8x8 (JPEG)**, not GEMM. The GEMM mentions below are
  illustrative — substitute JPEG/DCT8x8 reasoning (e.g. 8x8 block transforms,
  small working set, heavy shared-memory use).

## The Two Modes

**Mode A — Analysis (simpler, build first):**
Given one experiment's stats, the agents explain what's happening.
Memory agent on cache behavior, warp agent on occupancy, bottleneck agent
classifies the workload.

**Mode B — Autonomous Exploration (the novel part):**
The orchestrator proposes the next config based on history. The loop runs it,
feeds results back, and the orchestrator proposes again — until it converges
or hits the experiment budget.

## Build Order

### Step 1 — Agent prompts (1.5 hrs)

Write the four prompt files in `/agents/`. Each is a markdown file with the
agent's role, what stats it receives, and what output format it produces.

The KEY to quality: agents must say something SPECIFIC, not generic.
- Bad: "L1 hit rate improved."
- Good: "L1 hit rate rose to 74% — the GEMM tile working set now fits in
  64KB. Going to 128KB won't help; you've captured all the reuse."

Test each prompt against real stats. Iterate until the output is sharp.

### Step 2 — Analysis mode (2 hrs)

Write `agent_engine.py`:
- `analyze(stats, config, benchmark) -> AgentOutputs`
- Calls each agent with the stats, gets structured analysis
- Streams each agent's response back via SSE
- Use Claude with streaming enabled

**Test:** feed it real stats from Person 1's pipeline. Do the agents say
something a GPU architect would find correct and insightful?

### Step 3 — The bottleneck classifier (1.5 hrs)

The Bottleneck Agent is the most important — it drives the exploration.
It does a roofline-style analysis:
- High DRAM stalls + low IPC → memory-bandwidth bound → suggest more L2/channels
- High occupancy + low IPC + low DRAM stalls → compute bound → suggest more SMs
- Low occupancy → latency bound → suggest scheduler change

This logic is what the orchestrator uses to propose the next config.

### Step 4 — Autonomous exploration loop (3 hrs)

This is the centerpiece. Write `explore()`:

```python
async def explore(benchmark, goal, constraints, containers):
    history = []
    config = default_config()

    for iteration in range(MAX_ITERATIONS):  # e.g. 8
        # Run the current config (via Person 1's experiment_manager)
        stats = await run_experiment(config, benchmark, containers)
        history.append({"config": config, "stats": stats})

        # Agents analyze
        analysis = await analyze(stats, config, benchmark)
        yield {"type": "analysis", "iteration": iteration, "analysis": analysis}

        # Orchestrator decides next config
        decision = await orchestrator_propose(history, goal, constraints)
        yield {"type": "proposal", "reasoning": decision.reasoning,
               "next_config": decision.config}

        if decision.converged:
            yield {"type": "converged", "best": decision.best_config,
                   "pareto": compute_pareto(history)}
            break

        config = decision.config
```

The orchestrator prompt receives the FULL history and reasons like a senior
architect: "We've tried 4 configs. Increasing L1 helped until 64KB then
plateaued. DRAM is still the bottleneck. Next I'll increase memory channels."

**Test:** run a real exploration on DCT8x8 (JPEG). Does it actually converge toward a
good config? Does the reasoning make sense at each step?

### Step 5 — Human-in-the-loop intervention (1 hr)

Let the user inject constraints mid-exploration:
- "keep power proxy (SM count) under X"
- "prioritize memory bandwidth"
- Override a proposed config

The orchestrator takes these as additional context on the next proposal.

## Agent Prompt Templates

### agents/memory_agent.md
```
You are the Memory Agent in a GPU architecture analysis system.
You analyze the memory hierarchy behavior of a GPU running a workload.

You receive: L1 hit rate, L2 hit rate, DRAM stall cycles, total instructions,
the current config, and the benchmark name.

Reason about:
- Is the working set fitting in cache? What does the hit rate imply?
- Is DRAM bandwidth the bottleneck? (high stalls = yes)
- Would more cache help, or is reuse already captured?

Be SPECIFIC. Reference the actual numbers. Say what would help and why.
Output 2-3 sentences of sharp analysis, then a status: GREEN/AMBER/RED.
```

(Write similar focused prompts for warp_agent, bottleneck_agent, orchestrator.)

### agents/orchestrator.md
```
You are the Orchestrator in an autonomous GPU design space exploration.
Your job: given the history of configs tried and their results, propose the
NEXT config to try — reasoning like a senior GPU architect.

You receive: full experiment history (configs + stats), the user's goal, and
any constraints.

Reason step by step:
1. What's the current bottleneck across recent experiments?
2. Which parameter change is most likely to address it?
3. Have we plateaued? Are we at a Pareto-optimal point?

Output:
- reasoning: your architect's thought process
- next_config: the full config to try next (or null if converged)
- converged: boolean
- If converged, identify the best config and why.

Only change 1-2 parameters per step so the effect is isolatable.
```

## Claude Code Prompts

Start Claude Code in `/backend`:

```
1. "Read ../CLAUDE.md. Build agent_engine.py. Implement analyze(stats,
   config, benchmark) that calls 4 Claude agents (prompts in ../agents/),
   each analyzing the stats, streaming responses via SSE. Use the Anthropic
   Python SDK with streaming."

2. "Add the bottleneck classifier: given stats, classify as memory-bandwidth
   bound / compute bound / latency bound using the heuristics in
   BACKEND_PLAN, and return which param to change."

3. "Build the explore() async generator — the autonomous loop in
   AGENT_CORE_PLAN. It runs a config via experiment_manager, has agents
   analyze, then the orchestrator proposes the next config, looping until
   converged or MAX_ITERATIONS. Yield events for SSE."

4. "Add human-in-the-loop: explore() accepts mid-run constraints that get
   passed to the orchestrator's next proposal."
```

### Step 6 — Wrap agents in Fetch.ai coordination (1.5 hrs, AFTER agents work)

Only do this once the agents reason correctly as plain Claude calls. This is
the LIGHT integration — you're not rebuilding the agents, you're adding a
Fetch.ai messaging layer on top so they qualify as a Fetch multi-agent system.

Write `backend/fetch_agents.py`:
- `pip install uagents`
- Register each agent (Memory, Warp, Bottleneck, Orchestrator) as a uAgent
  with its own address
- Define a message model for passing stats and analysis between them
- The Orchestrator uAgent receives stats, messages the 4 specialist uAgents,
  collects their analysis, then produces the next-config proposal
- The actual reasoning inside each uAgent's handler is still your Claude call
  from agent_engine.py — Fetch just handles the agent-to-agent messaging

The point: same reasoning, but now it's a real multi-agent system with agents
that have identities and message each other through Fetch's protocol. That
satisfies the Fetch.ai prize requirement.

Keep the plain-Claude path working too — if Fetch integration gets flaky,
you can fall back to direct calls for the demo and still have the agents work.

## Claude Code Prompt For Fetch

```
"Build backend/fetch_agents.py. I have 4 working Claude agents in
agent_engine.py (Memory, Warp, Bottleneck, Orchestrator). Wrap them as
Fetch.ai uAgents using the uagents library. Each uAgent's message handler
calls the existing Claude analysis function. The Orchestrator uAgent messages
the other 3, collects responses, and produces the next config. Keep the
original direct-call path intact as a fallback."
```

## Your Definition Of Done

- Agents say specific, correct things about real stats (not generic filler)
- The autonomous loop actually converges toward better configs
- The orchestrator's reasoning is coherent step to step
- The whole exploration streams cleanly to the frontend
- A user can inject a constraint and the next proposal respects it
- Agents wrapped as Fetch uAgents (with direct-call fallback intact)


## Watch Out For

- **Generic agent output is the #1 risk.** Iterate prompts against REAL stats
  until they sound like a real architect. This is where your time goes.
- **Context growth.** As history grows, keep the orchestrator prompt focused —
  summarize older experiments rather than dumping everything.
- **Latency in the loop.** Each iteration = one 30s simulation + agent calls.
  8 iterations is minutes. Coordinate with the team on DEMO_MODE (pre-run
  experiments, replay with live agent reasoning).
- **Convergence detection.** Define it clearly — e.g. no param change improves
  IPC by more than 5%, or budget exhausted.
