import { useEffect, useState } from "react";
import { Database, Layers, Activity, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentType, AgentStatus, AgentVerdict, GPUConfig } from "../types";

const AGENT_META: Record<
  AgentType,
  { name: string; role: string; accent: string; soft: string; Icon: LucideIcon }
> = {
  memory: {
    name: "Memory Agent",
    role: "Cache hierarchy, DRAM pressure & bandwidth",
    accent: "#0ea5e9",
    soft: "#e0f2fe",
    Icon: Database,
  },
  warp: {
    name: "Warp Agent",
    role: "Occupancy & warp scheduling",
    accent: "#8b5cf6",
    soft: "#ede9fe",
    Icon: Layers,
  },
  bottleneck: {
    name: "Bottleneck Agent",
    role: "Roofline synthesis & classification",
    accent: "#f59e0b",
    soft: "#fef3c7",
    Icon: Activity,
  },
  orchestrator: {
    name: "Orchestrator",
    role: "Proposes the next design · tracks the Pareto frontier",
    accent: "#6366f1",
    soft: "#e0e7ff",
    Icon: Sparkles,
  },
};

// Verdict drives the status badge color once the agent settles.
const VERDICT_COLOR: Record<AgentVerdict, string> = {
  healthy: "#10b981",
  caution: "#f59e0b",
  critical: "#f43f5e",
  neutral: "#6366f1",
};
const VERDICT_SOFT: Record<AgentVerdict, string> = {
  healthy: "#ecfdf5",
  caution: "#fffbeb",
  critical: "#fff1f2",
  neutral: "#eef2ff",
};
const VERDICT_LABEL: Record<AgentVerdict, string> = {
  healthy: "Healthy",
  caution: "Caution",
  critical: "Bottleneck",
  neutral: "Proposal",
};

interface AgentCardProps {
  agent: AgentType;
  content: string;
  status: AgentStatus;
  verdict?: AgentVerdict;
  proposal?: { config: GPUConfig; expectedGain: string };
}

const SCHED_LABEL: Record<GPUConfig["scheduler"], string> = {
  gto: "GTO",
  lrr: "LRR",
  two_level_active: "2-Level",
};

function StatusBadge({ status, verdict }: { status: AgentStatus; verdict?: AgentVerdict }) {
  if (status === "thinking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-500">
        <span className="flex items-center gap-0.5">
          <span className="thinking-dot w-1 h-1 rounded-full bg-neutral-400" style={{ animationDelay: "0ms" }} />
          <span className="thinking-dot w-1 h-1 rounded-full bg-neutral-400" style={{ animationDelay: "160ms" }} />
          <span className="thinking-dot w-1 h-1 rounded-full bg-neutral-400" style={{ animationDelay: "320ms" }} />
        </span>
        Thinking
      </span>
    );
  }
  if (status === "complete" && verdict) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
        style={{ color: VERDICT_COLOR[verdict], background: VERDICT_SOFT[verdict] }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: VERDICT_COLOR[verdict] }} />
        {VERDICT_LABEL[verdict]}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-500">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
      <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
      Idle
    </span>
  );
}

export default function AgentCard({
  agent,
  content,
  status,
  verdict,
  proposal,
}: AgentCardProps) {
  const meta = AGENT_META[agent];
  const { Icon } = meta;
  const active = status === "thinking" || status === "complete";

  // Client-side typewriter: agent text arrives as a complete block, so reveal
  // it progressively here (the backend doesn't stream tokens).
  const [count, setCount] = useState(0);
  const [prevContent, setPrevContent] = useState(content);
  if (content !== prevContent) {
    // React's "adjust state during render" pattern — reset the reveal.
    setPrevContent(content);
    setCount(0);
  }
  useEffect(() => {
    if (!content) return;
    const step = Math.max(2, Math.ceil(content.length / 90));
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(content.length, i + step);
      setCount(i);
      if (i >= content.length) clearInterval(id);
    }, 18);
    return () => clearInterval(id);
  }, [content]);
  const shown = content.slice(0, count);
  const revealing = count < content.length;

  return (
    <div
      className={`rounded-2xl border bg-white p-5 transition-all duration-300 ${
        active
          ? "border-neutral-200 shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
          : "border-neutral-200/70"
      }`}
    >
      <div className="flex items-start gap-3.5">
        {/* Avatar */}
        <div
          className="flex-none w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300"
          style={{
            background: active ? meta.soft : "#f5f5f5",
            color: active ? meta.accent : "#a3a3a3",
          }}
        >
          <Icon size={18} strokeWidth={2} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-neutral-900 leading-tight">
                {meta.name}
              </p>
              <p className="text-[12px] text-neutral-400 leading-tight mt-0.5 truncate">
                {meta.role}
              </p>
            </div>
            <div className="flex-none">
              <StatusBadge status={status} verdict={verdict} />
            </div>
          </div>

          {/* Reasoning body (client-side typewriter) */}
          {active && content !== "" && (
            <p className="mt-3 text-[14px] leading-7 text-neutral-700 animate-fade-in-up">
              {shown}
              {(status === "thinking" || revealing) && (
                <span
                  className="inline-block w-[2px] h-[15px] ml-0.5 align-middle animate-soft-blink rounded-full"
                  style={{ background: meta.accent }}
                />
              )}
            </p>
          )}

          {/* Orchestrator's proposed next config */}
          {proposal && (
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 animate-fade-in-up">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wide">
                  Proposed Next Configuration
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                  {proposal.expectedGain}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                <ConfigRow k="SM Clusters" v={proposal.config.n_clusters} />
                <ConfigRow k="L1 Sets" v={proposal.config.l1_sets} />
                <ConfigRow k="Scheduler" v={SCHED_LABEL[proposal.config.scheduler]} />
                <ConfigRow k="Sched / Core" v={proposal.config.num_sched_per_core} />
                <ConfigRow k="Mem Ctrl" v={proposal.config.n_mem} />
                <ConfigRow k="L2 Sets" v={proposal.config.l2_sets} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfigRow({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{k}</span>
      <span className="font-metric font-medium text-neutral-900">{v}</span>
    </div>
  );
}
