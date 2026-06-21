"""LOCAL test of the multi-agent mesh — NO Agentverse, NO mailbox.

Runs the 4 bureau agents + a tester together; the tester sends the orchestrator
a chat message and verifies it delegates to all three specialist uAgents
(real intra-bureau Fetch messages) and replies with their combined verdicts.

Prereqs (run in the `fetch` env):
    pip install uagents aiohttp
    # backend must be running so specialists can call /agent/analyze:
    DEMO_MODE=1 DISABLE_REDIS=1 uvicorn backend.main:app --port 8000   # other terminal

Run:
    python tests/fetch/test_bureau_local.py
Expect: "REPLY: ... MEMORY ... WARP ... BOTTLENECK ..." then "PASS".
Exits 0 on success, 1 on bad reply, 2 on timeout.
"""
import os
import sys
import threading
from datetime import datetime
from uuid import uuid4

# must be set BEFORE importing fetch_bureau so agents are created mailbox-free
os.environ["FETCH_MAILBOX"] = "0"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from uagents import Agent, Bureau, Context, Protocol  # noqa: E402
from uagents_core.contrib.protocols.chat import (  # noqa: E402
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

from backend import fetch_bureau as fb  # noqa: E402

tester = Agent(name="tester", seed="gpu-mesh-tester-seed-001")
chat = Protocol(spec=chat_protocol_spec)


@tester.on_event("startup")
async def kick(ctx: Context):
    ctx.logger.info("tester -> orchestrator: requesting analysis")
    await ctx.send(
        fb.orchestrator.address,
        ChatMessage(
            timestamp=datetime.utcnow(),
            msg_id=uuid4(),
            content=[TextContent(type="text", text="analyze the baseline JPEG config")],
        ),
    )


@chat.on_message(ChatMessage)
async def got_reply(ctx: Context, sender: str, msg: ChatMessage):
    text = "".join(i.text for i in msg.content if isinstance(i, TextContent))
    print("\nREPLY:\n" + text + "\n")
    ok = all(tok in text.upper() for tok in ("MEMORY", "WARP", "BOTTLENECK"))
    print("PASS — orchestrator delegated to all 3 specialists" if ok
          else "FAIL — reply missing a specialist")
    os._exit(0 if ok else 1)


@chat.on_message(ChatAcknowledgement)
async def ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


tester.include(chat)


if __name__ == "__main__":
    # watchdog: fail if no collaborative reply within 90s
    threading.Timer(90, lambda: (print("TIMEOUT — no reply (is the backend running on :8000?)"),
                                  os._exit(2))).start()
    bureau = Bureau(port=8201)
    for a in (*fb.AGENTS, tester):
        bureau.add(a)
    bureau.run()
