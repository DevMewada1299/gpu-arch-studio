import { useEffect, useState } from "react";
import AgentCard from "./AgentCard";
import { startMockExplore, type ExploreEvent } from "../lib/exploreStream";
import type { AgentType, AgentStatus, AgentVerdict, GPUConfig } from "../types";

const AGENT_ORDER: AgentType[] = ["memory", "warp", "bottleneck", "orchestrator"];

interface AgentState {
  content: string;
  status: AgentStatus;
  verdict?: AgentVerdict;
}

const emptyState = (): Record<AgentType, AgentState> => ({
  memory: { content: "", status: "idle" },
  warp: { content: "", status: "idle" },
  bottleneck: { content: "", status: "idle" },
  orchestrator: { content: "", status: "idle" },
});

interface AgentPanelProps {
  // Incremented by the parent each time "Explore" is clicked. 0 = never run.
  // The parent also passes this as `key`, so each pass remounts fresh — no
  // manual state reset (and no synchronous setState) needed in the effect.
  runId: number;
  onProposal?: (config: GPUConfig) => void;
}

export default function AgentPanel({ runId, onProposal }: AgentPanelProps) {
  const [agents, setAgents] = useState<Record<AgentType, AgentState>>(emptyState);
  const [proposal, setProposal] = useState<
    { config: GPUConfig; expectedGain: string } | undefined
  >();
  // Lazy init from runId — true the moment a fresh-remounted panel starts.
  const [running, setRunning] = useState(() => runId !== 0);

  useEffect(() => {
    if (runId === 0) return; // not started yet

    const handle = startMockExplore((e: ExploreEvent) => {
      switch (e.type) {
        case "agent_start":
          setAgents((prev) => ({
            ...prev,
            [e.agent]: { content: "", status: "thinking" },
          }));
          break;
        case "agent_token":
          setAgents((prev) => ({
            ...prev,
            [e.agent]: {
              ...prev[e.agent],
              content: prev[e.agent].content + e.token,
            },
          }));
          break;
        case "agent_complete":
          setAgents((prev) => ({
            ...prev,
            [e.agent]: { ...prev[e.agent], status: "complete", verdict: e.verdict },
          }));
          break;
        case "proposal":
          setProposal({ config: e.config, expectedGain: e.expectedGain });
          onProposal?.(e.config);
          break;
        case "done":
          setRunning(false);
          break;
      }
    });

    return () => handle.cancel();
  }, [runId, onProposal]);

  return (
    <div className="space-y-2">
      {runId === 0 && (
        <p className="text-[11px] text-slate-600 mb-2 leading-relaxed">
          Four agents analyze each simulation and converge on a Pareto-optimal
          design. Click <span className="text-cyan-400">Explore</span> to start
          an autonomous pass.
        </p>
      )}

      {running && (
        <div className="flex items-center gap-2 mb-1 text-[10px] font-mono text-cyan-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          exploration in progress…
        </div>
      )}

      {AGENT_ORDER.map((agent) => (
        <AgentCard
          key={agent}
          agent={agent}
          content={agents[agent].content}
          status={agents[agent].status}
          verdict={agents[agent].verdict}
          proposal={agent === "orchestrator" ? proposal : undefined}
        />
      ))}
    </div>
  );
}
