"""Fetch.ai uAgent wrapper — the ASI1 / Agentverse entry point.

This is a SEPARATE PROCESS from the FastAPI backend. It imports only `uagents`
and an HTTP client, and calls the backend over HTTP — so its dependencies
(uagents pins an older pydantic) can NEVER affect the running backend.

It exposes the whole GPU Architecture Studio as one chattable agent:
  ASI1 / another agent  --ChatMessage-->  this uAgent  --HTTP /explore/run-->  backend
                                                        <-- best config + reasoning

Run it (in a venv that has `uagents`):
    python backend/fetch_agents.py
On startup it prints the agent address + an Agentverse inspector URL; log in at
agentverse.ai to claim/connect it (Mailbox) so it gets a public profile and is
reachable from ASI1.

Env:
    BACKEND_URL        backend base URL (default http://localhost:8000)
    FETCH_AGENT_SEED   stable seed so the agent keeps its address/identity
"""

import os
from datetime import datetime
from uuid import uuid4

import aiohttp
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    TextContent,
    chat_protocol_spec,
)

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")

agent = Agent(
    name="gpu-architecture-studio",
    seed=os.environ.get("FETCH_AGENT_SEED", "gpu-architecture-studio-seed-001"),
    port=8100,
    mailbox=True,
    publish_agent_details=True,
)

chat = Protocol(spec=chat_protocol_spec)


async def _run_exploration(goal: str) -> dict:
    payload = {"goal": goal, "benchmark": "dct8x8", "max_iterations": 3}
    timeout = aiohttp.ClientTimeout(total=600)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.post(f"{BACKEND_URL}/explore/run", json=payload) as resp:
            resp.raise_for_status()
            return await resp.json()


def _format(result: dict) -> str:
    cfg = result.get("best_config") or {}
    runs = result.get("runs", [])
    trail = " → ".join(
        f"{r.get('n_clusters')}cl:{round(r['ipc']) if r.get('ipc') else '?'}IPC"
        for r in runs
    )
    return (
        f"🏆 Best GPU config for the JPEG/DCT8x8 workload "
        f"(after {result.get('iterations', '?')} autonomous experiments):\n\n"
        f"  SM clusters: {cfg.get('n_clusters')}, cores/cluster: {cfg.get('cores_per_cluster')}\n"
        f"  memory controllers: {cfg.get('n_mem')}, scheduler: {cfg.get('scheduler')}\n"
        f"  L1 sets: {cfg.get('l1_sets')}, L2 sets: {cfg.get('l2_sets')}, "
        f"shmem: {cfg.get('shmem_size')}\n"
        f"  → IPC = {result.get('best_ipc')}\n\n"
        f"Exploration path: {trail}\n\n"
        f"Orchestrator's reasoning: {result.get('final_reasoning', '')[:600]}"
    )


@chat.on_message(ChatMessage)
async def handle_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(
        sender,
        ChatAcknowledgement(timestamp=datetime.utcnow(), acknowledged_msg_id=msg.msg_id),
    )
    text = "".join(item.text for item in msg.content if isinstance(item, TextContent))
    ctx.logger.info(f"chat request: {text!r}")

    goal = text.strip() or "maximize IPC for the JPEG/DCT8x8 workload"
    try:
        result = await _run_exploration(goal)
        reply = _format(result)
    except Exception as exc:  # noqa: BLE001 - report failures back to the chat
        reply = f"Sorry — the exploration failed: {type(exc).__name__}: {exc}"
        ctx.logger.error(reply)

    await ctx.send(
        sender,
        ChatMessage(
            timestamp=datetime.utcnow(),
            msg_id=uuid4(),
            content=[TextContent(type="text", text=reply),
                     EndSessionContent(type="end-session")],
        ),
    )


@chat.on_message(ChatAcknowledgement)
async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)


if __name__ == "__main__":
    agent.run()
