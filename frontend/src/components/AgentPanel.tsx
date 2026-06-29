import { useEffect, useRef, useState } from "react";
import { Sparkles, Brain, Trophy, AlertTriangle } from "lucide-react";
import AgentCard from "./AgentCard";
import { api } from "../lib/api";
import type {
  AgentType,
  AgentStatus,
  AgentVerdict,
  AgentColor,
  GPUConfig,
  SimStats,
  ExploreStreamEvent,
} from "../types";

const AGENT_ORDER: AgentType[] = ["memory", "warp", "bottleneck", "orchestrator"];

const COLOR_TO_VERDICT: Record<AgentColor, AgentVerdict> = {
  green: "healthy",
  amber: "caution",
  red: "critical",
};

// Strip the model's trailing "STATUS: AMBER" tag and "[demo]" markers — the
// status is rendered as a colored badge, not inline text.
function cleanText(t: string): string {
  return t
    .replace(/\s*STATUS:\s*\w+.*$/is, "")
    .replace(/\[demo\]/gi, "")
<<<<<<< HEAD
    // strip Markdown so cards render clean prose (agents emit ## and **)
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")   // headers -> plain line
    .replace(/\*\*/g, "")                  // bold markers
    .replace(/`/g, "")                     // inline code ticks
    .replace(/^\s*[-*]\s+/gm, "• ")        // bullets -> •
    .replace(/\n{3,}/g, "\n\n")            // collapse blank runs
=======
>>>>>>> frontend
    .trim();
}

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
  // Incremented (and passed as key) by the parent each Explore click. 0 = idle.
  runId: number;
  goal: string;
  onGoalChange: (g: string) => void;
  benchmark: string;
  startConfig: GPUConfig;
  maxIterations?: number;
  onProposal?: (config: GPUConfig) => void;
  onExperiment?: (expId: string, stats: SimStats, config: GPUConfig) => void;
  onConverged?: (info: { best_exp_id: string | null; pareto: string[] }) => void;
}

export default function AgentPanel({
  runId,
  goal,
  onGoalChange,
  benchmark,
  startConfig,
  maxIterations = 4,
  onProposal,
  onExperiment,
  onConverged,
}: AgentPanelProps) {
  const [agents, setAgents] = useState<Record<AgentType, AgentState>>(emptyState);
  const [proposal, setProposal] = useState<
    { config: GPUConfig; expectedGain: string } | undefined
  >();
  const [running, setRunning] = useState(() => runId !== 0);
  const [iteration, setIteration] = useState<number | null>(null);
  const [recall, setRecall] = useState(0);
  const [best, setBest] = useState<{ exp_id: string | null; pareto: string[] } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stable refs so the stream effect depends only on runId.
  const cbRef = useRef({ onProposal, onExperiment, onConverged });
  useEffect(() => {
    cbRef.current = { onProposal, onExperiment, onConverged };
  });
  const startRef = useRef({ goal, benchmark, startConfig, maxIterations });

  useEffect(() => {
    if (runId === 0) return; // idle

    let cancelled = false;
    let handle: { cancel: () => void } | null = null;
    const { goal, benchmark, startConfig, maxIterations } = startRef.current;

    api
      .explore({ goal, benchmark, start_config: startConfig, max_iterations: maxIterations })
      .then(({ session_id }) => {
        if (cancelled) return;
        handle = api.streamExplore(
          session_id,
          (e: ExploreStreamEvent) => {
            switch (e.type) {
              case "iteration_start":
                setIteration(e.iteration);
                setAgents((prev) => ({
                  memory: { ...prev.memory, content: "", status: "thinking" },
                  warp: { ...prev.warp, content: "", status: "thinking" },
                  bottleneck: { ...prev.bottleneck, content: "", status: "thinking" },
                  orchestrator: { ...prev.orchestrator, content: "", status: "thinking" },
                }));
                break;
              case "experiment":
                cbRef.current.onExperiment?.(e.exp_id, e.stats, e.config);
                break;
              case "analysis":
                setAgents((prev) => ({
                  ...prev,
                  memory: {
                    content: cleanText(e.agents.memory.text),
                    status: "complete",
                    verdict: COLOR_TO_VERDICT[e.agents.memory.status],
                  },
                  warp: {
                    content: cleanText(e.agents.warp.text),
                    status: "complete",
                    verdict: COLOR_TO_VERDICT[e.agents.warp.status],
                  },
                  bottleneck: {
                    content: cleanText(e.agents.bottleneck.text),
                    status: "complete",
                    verdict: COLOR_TO_VERDICT[e.agents.bottleneck.status],
                  },
                }));
                break;
              case "recall":
                setRecall(e.recalled.length);
                break;
              case "proposal":
                setAgents((prev) => ({
                  ...prev,
                  orchestrator: {
                    content: cleanText(e.reasoning),
                    status: "complete",
                    verdict: "neutral",
                  },
                }));
                if (e.next_config) {
                  setProposal({
                    config: e.next_config,
                    expectedGain: e.converged ? "converged" : "next config",
                  });
                  cbRef.current.onProposal?.(e.next_config);
                }
                break;
              case "converged":
                setBest({ exp_id: e.best_exp_id, pareto: e.pareto });
                setRunning(false);
                cbRef.current.onConverged?.({
                  best_exp_id: e.best_exp_id,
                  pareto: e.pareto,
                });
                break;
              case "note":
                break;
              case "error":
                setErrorMsg(e.message);
                break;
            }
          },
          () => setRunning(false)
        );
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setRunning(false);
      });

    return () => {
      cancelled = true;
      handle?.cancel();
    };
  }, [runId]);

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
            {iteration != null ? `Iteration ${iteration + 1}` : "Exploring"}
          </span>
        ) : runId !== 0 && !errorMsg ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-600">
            <Trophy size={12} />
            Converged
          </span>
        ) : null}
      </div>

      {/* Idle empty-state: goal input + prompt */}
      {runId === 0 && (
        <div className="mb-5 rounded-2xl border border-dashed border-neutral-200 bg-white/60 px-5 py-6 text-center">
          <div className="mx-auto w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-3">
            <Sparkles size={20} />
          </div>
          <p className="text-[14px] text-neutral-600 leading-relaxed max-w-md mx-auto">
            Set a goal and press <span className="font-medium text-indigo-600">Explore</span>.
            The agents run real simulations, reason over each result, and propose the
            next configuration to try.
          </p>
          <input
            value={goal}
            onChange={(e) => onGoalChange(e.target.value)}
            placeholder="Exploration goal (e.g. maximize IPC)"
            className="mt-4 w-full max-w-md mx-auto block rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-[13px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-shadow"
          />
        </div>
      )}

      {/* Recall moment */}
      {recall > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-2.5 text-[12px] text-violet-700">
          <Brain size={14} className="text-violet-500" />
          Recalled {recall} relevant prior {recall === 1 ? "run" : "runs"} from memory.
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/60 px-4 py-2.5 text-[12px] text-rose-700">
          <AlertTriangle size={14} className="text-rose-500" />
          {errorMsg}
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

      {/* Pareto / best summary */}
      {best && best.pareto.length > 0 && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Trophy size={14} className="text-emerald-600" />
            <span className="text-[12px] font-semibold text-emerald-700">
              Pareto frontier · {best.pareto.length} configs
            </span>
          </div>
          <p className="text-[12px] text-neutral-600">
            Best experiment:{" "}
            <span className="font-mono text-neutral-800">{best.exp_id ?? "—"}</span>
          </p>
        </div>
      )}
    </section>
  );
}
