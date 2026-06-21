"""Multi-agent Fetch.ai system (BONUS: effective multi-agent collaboration).

Four uAgents run together in one Bureau and message each other over Fetch's
protocol:

    ASI:One ─chat─► Orchestrator uAgent ──AnalyzeRequest──► Memory uAgent
                          ▲                              ├─► Warp uAgent
                          └────AnalyzeResult─────────────┴─► Bottleneck uAgent

The Orchestrator receives a chat message, delegates the analysis to the three
specialist uAgents (real agent-to-agent messages), collects their verdicts, and
replies. Each specialist does its actual Claude analysis by calling the backend
(`POST /agent/analyze`) — so the heavy deps stay in the backend and these
uAgents stay thin. All four register on Agentverse (4 public profiles).

This is the multi-agent BONUS surface. `fetch_agents.py` remains the primary
single-agent entry point that runs the full autonomous exploration.

Run (in the `fetch` env: `pip install uagents aiohttp`):
    python backend/fetch_bureau.py
Each agent prints an Agentverse inspector URL — claim each via Connect → Mailbox.
Keep the backend running (these call it over HTTP).
"""

import asyncio
import os
from datetime import datetime
from uuid import uuid4

import aiohttp
from uagents import Agent, Bureau, Context, Model, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
SPECIALISTS = ("memory", "warp", "bottleneck")

# Port for the Bureau's own server (must NOT collide with the backend on 8000).
BUREAU_PORT = int(os.environ.get("FETCH_BUREAU_PORT", "8200"))
# Mailbox connects agents to Agentverse. Set FETCH_MAILBOX=0 to run fully local
# (e.g. the local mesh test) — intra-bureau messaging works without a mailbox.
MAILBOX = os.environ.get("FETCH_MAILBOX", "1") == "1"

# The config the coordinator runs for real before delegating analysis. The
# STATS are NOT hardcoded — they come from an actual backend run (a real
# GPGPU-Sim simulation in normal mode, or a replay in DEMO_MODE).
BASELINE_CONFIG = {
    "n_clusters": 15, "cores_per_cluster": 1, "n_mem": 6, "shmem_size": 49152,
    "scheduler": "gto", "num_sched_per_core": 2, "l1_sets": 32, "l2_sets": 64,
}


async def run_real_experiment(config: dict) -> tuple:
    """Run a REAL experiment via the backend and return (config, stats).

    Posts to /experiments/run and polls /experiments/{id} until the simulation
    completes — so the specialists analyze fresh simulation data, not a fixed
    snapshot. Raises if it doesn't finish in time.
    """
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=180)) as s:
        async with s.post(f"{BACKEND_URL}/experiments/run",
                          json={"config": config, "benchmark": "dct8x8"}) as r:
            exp_id = (await r.json())["exp_id"]
        for _ in range(60):  # up to ~120s
            await asyncio.sleep(2)
            async with s.get(f"{BACKEND_URL}/experiments/{exp_id}") as r:
                if r.status == 200:
                    exp = await r.json()
                    if exp.get("stats", {}).get("ipc") is not None:
                        return exp["config"], exp["stats"]
    raise RuntimeError("experiment did not complete in time")


# --- inter-agent message models ------------------------------------------

class AnalyzeRequest(Model):
    req_id: str
    agent: str
    config: dict
    stats: dict


class AnalyzeResult(Model):
    req_id: str
    agent: str
    text: str
    status: str


# --- specialist uAgents ---------------------------------------------------

def make_specialist(name: str) -> Agent:
    a = Agent(
        name=f"gpu-{name}-agent",
        seed=os.environ.get(f"FETCH_{name.upper()}_SEED", f"gpu-{name}-agent-seed-001"),
        mailbox=MAILBOX,
        publish_agent_details=MAILBOX,
    )

    @a.on_message(model=AnalyzeRequest)
    async def handle(ctx: Context, sender: str, msg: AnalyzeRequest):
        ctx.logger.info(f"{name} agent analyzing (req {msg.req_id[:6]})")
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as s:
                async with s.post(
                    f"{BACKEND_URL}/agent/analyze",
                    json={"agent": msg.agent, "config": msg.config, "stats": msg.stats},
                ) as r:
                    data = await r.json()
            text, status = data.get("text", ""), data.get("status", "amber")
        except Exception as exc:  # noqa: BLE001
            text, status = f"({name} analysis failed: {exc})", "amber"
        await ctx.send(sender, AnalyzeResult(
            req_id=msg.req_id, agent=msg.agent, text=text, status=status))

    return a


memory_agent = make_specialist("memory")
warp_agent = make_specialist("warp")
bottleneck_agent = make_specialist("bottleneck")
SPECIALIST_ADDR = {
    "memory": memory_agent.address,
    "warp": warp_agent.address,
    "bottleneck": bottleneck_agent.address,
}


# --- coordinator uAgent (chat-facing) -------------------------------------

orchestrator = Agent(
    name="gpu-orchestrator-agent",
    seed=os.environ.get("FETCH_ORCHESTRATOR_SEED", "gpu-orchestrator-agent-seed-001"),
    mailbox=MAILBOX,
    publish_agent_details=MAILBOX,
)
chat = Protocol(spec=chat_protocol_spec)

# req_id -> {"sender": chat_sender, "results": {agent: AnalyzeResult}}
_pending: dict = {}


@chat.on_message(ChatMessage)
async def on_chat(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(
        timestamp=datetime.utcnow(), acknowledged_msg_id=msg.msg_id))

    # Run a REAL experiment first, then delegate analysis of its fresh stats.
    try:
        config, stats = await run_real_experiment(BASELINE_CONFIG)
    except Exception as exc:  # noqa: BLE001
        await ctx.send(sender, ChatMessage(
            timestamp=datetime.utcnow(), msg_id=uuid4(),
            content=[TextContent(type="text", text=f"Could not run a simulation: {exc}"),
                     EndSessionContent(type="end-session")]))
        return

    req_id = uuid4().hex
    _pending[req_id] = {"sender": sender, "results": {}, "ipc": stats.get("ipc")}
    ctx.logger.info(f"real sim done (IPC {stats.get('ipc')}); delegating to "
                    f"{len(SPECIALISTS)} specialist agents")
    for name in SPECIALISTS:
        await ctx.send(SPECIALIST_ADDR[name], AnalyzeRequest(
            req_id=req_id, agent=name, config=config, stats=stats))


@orchestrator.on_message(model=AnalyzeResult)
async def on_result(ctx: Context, sender: str, msg: AnalyzeResult):
    p = _pending.get(msg.req_id)
    if not p:
        return
    p["results"][msg.agent] = msg
    if len(p["results"]) < len(SPECIALISTS):
        return  # wait for all specialists

    lines = [f"• {a.upper()} [{p['results'][a].status}]: {p['results'][a].text}"
             for a in SPECIALISTS if a in p["results"]]
    reply = (
        f"Ran a real JPEG/DCT8x8 simulation (IPC = {p.get('ipc')}). Three "
        f"specialist agents analyzed it, collaborating via Fetch.ai messaging:\n\n"
        + "\n\n".join(lines)
    )
    await ctx.send(p["sender"], ChatMessage(
        timestamp=datetime.utcnow(), msg_id=uuid4(),
        content=[TextContent(type="text", text=reply),
                 EndSessionContent(type="end-session")]))
    _pending.pop(msg.req_id, None)


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


orchestrator.include(chat, publish_manifest=True)

AGENTS = (orchestrator, memory_agent, warp_agent, bottleneck_agent)


def run():
    bureau = Bureau(port=BUREAU_PORT)
    for _a in AGENTS:
        bureau.add(_a)
    print("Orchestrator:", orchestrator.address)
    for name, addr in SPECIALIST_ADDR.items():
        print(f"{name}:", addr)
    bureau.run()


if __name__ == "__main__":
    run()
