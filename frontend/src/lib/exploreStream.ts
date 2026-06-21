import type { AgentType, AgentVerdict, GPUConfig } from "../types";

// Event shape emitted by an exploration session. The real backend SSE endpoint
// GET /explore/{session}/stream will emit equivalent JSON events; this mock
// mirrors them so the UI layer is identical when we swap in EventSource.
export type ExploreEvent =
  | { type: "agent_start"; agent: AgentType }
  | { type: "agent_token"; agent: AgentType; token: string }
  | { type: "agent_complete"; agent: AgentType; verdict: AgentVerdict }
  | { type: "proposal"; config: GPUConfig; expectedGain: string }
  | { type: "done" };

export interface ExploreHandle {
  cancel: () => void;
}

// ── Mock script ────────────────────────────────────────────────────────────
// One scripted reasoning pass over the four agents, ending in a proposal.

interface AgentScript {
  agent: AgentType;
  verdict: AgentVerdict;
  text: string;
}

const SCRIPT: AgentScript[] = [
  {
    agent: "memory",
    verdict: "critical",
    text:
      "L1 hit rate is critically low at 38.5%. The DCT8x8 kernel reads an 8×8 " +
      "pixel block per thread — with only 32 sets and 4-way associativity the " +
      "working set thrashes before reuse. L2 absorbs the overflow at 50.6% hit, " +
      "pushing 30% of accesses all the way to DRAM. Recommend expanding L1 to " +
      "128 sets (64 KB) to capture the full block and break the eviction cycle.",
  },
  {
    agent: "warp",
    verdict: "caution",
    text:
      "Occupancy sits at 29.7% — too low to hide the memory latency the kernel " +
      "is exposing. GTO favors the oldest warp, which starves the rest under " +
      "low occupancy. Switching to LRR spreads issue pressure across all warps " +
      "and lifts memory-level parallelism. Bumping schedulers/core to 4 further " +
      "increases issue width once more warps are resident.",
  },
  {
    agent: "bottleneck",
    verdict: "critical",
    text:
      "Roofline classification: this workload is MEMORY-LATENCY bound, not " +
      "bandwidth bound — L2 BW at 54 GB/s is far below the 177 GB/s ceiling. " +
      "The critical path is L1 capacity → L2 pressure → DRAM round-trips. " +
      "Fixing L1 capacity should cascade: fewer L2 lookups, fewer DRAM stalls, " +
      "higher effective IPC. Scaling SM clusters helps only after L1 is resolved.",
  },
  {
    agent: "orchestrator",
    verdict: "neutral",
    text:
      "Synthesizing all three: the dominant lever is L1 capacity, with scheduler " +
      "and occupancy as secondary gains. Proposing the next experiment — clusters " +
      "60, L1 128 sets, LRR scheduler, 4 schedulers/core, 8 memory controllers. " +
      "This targets the latency bottleneck head-on while exposing more parallelism.",
  },
];

const PROPOSED_CONFIG: GPUConfig = {
  n_clusters: 60,
  cores_per_cluster: 1,
  l1_sets: 128,
  l2_sets: 64,
  scheduler: "lrr",
  n_mem: 8,
  shmem_size: 49152,
  schedulers_per_core: 4,
};

// Tokenize keeping trailing spaces so reassembly is exact.
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Start a mock exploration stream. Emits events via `onEvent` with realistic
 * pacing. Returns a handle to cancel mid-stream (mirrors EventSource.close).
 */
export function startMockExplore(
  onEvent: (e: ExploreEvent) => void,
  opts: { tokenDelay?: number; gapDelay?: number } = {}
): ExploreHandle {
  const tokenDelay = opts.tokenDelay ?? 22;
  const gapDelay = opts.gapDelay ?? 450;

  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const sleep = (ms: number) =>
    new Promise<void>((res) => timers.push(setTimeout(res, ms)));

  (async () => {
    await sleep(250);
    for (const step of SCRIPT) {
      if (cancelled) return;
      onEvent({ type: "agent_start", agent: step.agent });
      await sleep(300);

      for (const token of tokenize(step.text)) {
        if (cancelled) return;
        onEvent({ type: "agent_token", agent: step.agent, token });
        await sleep(tokenDelay);
      }

      if (cancelled) return;
      onEvent({ type: "agent_complete", agent: step.agent, verdict: step.verdict });

      if (step.agent === "orchestrator") {
        await sleep(200);
        if (cancelled) return;
        onEvent({
          type: "proposal",
          config: PROPOSED_CONFIG,
          expectedGain: "+42% IPC",
        });
      }
      await sleep(gapDelay);
    }
    if (!cancelled) onEvent({ type: "done" });
  })();

  return {
    cancel: () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    },
  };
}

// ── Real backend stub (wired in during integration) ────────────────────────
// export function startExplore(sessionId: string, onEvent): ExploreHandle {
//   const es = new EventSource(`/explore/${sessionId}/stream`);
//   es.onmessage = (ev) => onEvent(JSON.parse(ev.data));
//   return { cancel: () => es.close() };
// }
