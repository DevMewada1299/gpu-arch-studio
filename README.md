# GPU Architecture Studio — Team Quickstart

An agentic GPU microarchitecture design space exploration tool. Claude agents
autonomously run GPGPU-Sim experiments, analyze results, and converge on
optimal GPU configurations — explaining every decision.

## Read These In Order

1. **CLAUDE.md** — shared context. Everyone reads this. Claude Code reads it too.
2. **docs/MASTER_PLAN.md** — timeline, integration, demo. Read as a team first.
3. Your module plan:
   - Person 1 → **docs/BACKEND_PLAN.md**
   - Person 2 → **docs/FRONTEND_PLAN.md**
   - Person 3 → **docs/AGENT_CORE_PLAN.md**

## One-Time Setup (everyone)

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Set your API key (add to ~/.zshrc)
export ANTHROPIC_API_KEY=sk-ant-...

# Clone and enter
git clone <repo-url>
cd gpu-arch-studio

# Start Redis
docker run -d -p 6379:6379 --name redis redis

# Start Claude Code — it reads CLAUDE.md automatically
claude
```

## How We Work With Claude Code

- Each person runs `claude` inside their module folder
- Build ONE piece at a time, test it, then the next
- Always test against REAL gpgpu-sim output, never assumed output
- Update the "What's Working" checklist in CLAUDE.md after each piece
- Commit small, push often

## Project Structure

```
gpu-arch-studio/
├── CLAUDE.md              ← shared context (read first)
├── README.md             ← this file
├── docs/
│   ├── MASTER_PLAN.md    ← timeline + integration + demo
│   ├── BACKEND_PLAN.md   ← Person 1
│   ├── FRONTEND_PLAN.md  ← Person 2
│   └── AGENT_CORE_PLAN.md← Person 3
├── backend/              ← FastAPI + Docker + agents
├── frontend/             ← React studio UI
├── agents/               ← agent prompt files
├── samples/              ← real gpgpu-sim output for testing
└── experiments/          ← mounted into containers (gitignored)
```

## The Critical First Hour

Person 1: get a REAL gpgpu-sim run, save the output to
`samples/gemm_output.log`, commit and push it immediately. Person 3 cannot
build good agents without real stats to test against. This unblocks the team.

## Targets

- **Track:** Lab Track (hardware / scientific tooling)
- **Prizes:** Anthropic (Claude Code), Redis, Sentry, The Token Company
- **The win condition:** the autonomous exploration loop works and the agent
  reasoning is sharp. That's what makes this novel, not a wrapper.
