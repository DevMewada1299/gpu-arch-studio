import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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
    <section>
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 tracking-tight">
            Exploration Agents
          </h2>
          <p className="text-[13px] text-neutral-500 mt-0.5">
            Four specialists analyze each run and converge on a Pareto-optimal design.
          </p>
        </div>
        {running ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-[12px] font-medium text-indigo-600">
            <span className="flex items-center gap-0.5">
              <span className="thinking-dot w-1 h-1 rounded-full bg-indigo-500" style={{ animationDelay: "0ms" }} />
              <span className="thinking-dot w-1 h-1 rounded-full bg-indigo-500" style={{ animationDelay: "160ms" }} />
              <span className="thinking-dot w-1 h-1 rounded-full bg-indigo-500" style={{ animationDelay: "320ms" }} />
            </span>
            Exploring
          </span>
        ) : runId !== 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Complete
          </span>
        ) : null}
      </div>

      {/* Idle empty-state hint */}
      {runId === 0 && (
        <div className="mb-5 rounded-2xl border border-dashed border-neutral-200 bg-white/60 px-5 py-6 text-center">
          <div className="mx-auto w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-3">
            <Sparkles size={20} />
          </div>
          <p className="text-[14px] text-neutral-600 leading-relaxed max-w-md mx-auto">
            Press <span className="font-medium text-indigo-600">Explore</span> to start
            an autonomous design pass. The agents will reason through each result
            and propose the next configuration to try.
          </p>
        </div>
      )}

      {/* Agent stream */}
      <div className="space-y-4">
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
    </section>
  );
}
