import type { AgentType, AgentStatus, AgentVerdict, GPUConfig } from "../types";

const AGENT_META: Record<AgentType, { name: string; role: string; accent: string }> = {
  memory: { name: "Memory Agent", role: "cache · DRAM · bandwidth", accent: "#60a5fa" },
  warp: { name: "Warp Agent", role: "occupancy · scheduler", accent: "#a78bfa" },
  bottleneck: { name: "Bottleneck Agent", role: "roofline synthesis", accent: "#fbbf24" },
  orchestrator: { name: "Orchestrator", role: "next config · Pareto", accent: "#22d3ee" },
};

// Verdict drives the left border + status pill color once the agent settles.
const VERDICT_COLOR: Record<AgentVerdict, string> = {
  healthy: "#4ade80",
  caution: "#fbbf24",
  critical: "#f87171",
  neutral: "#22d3ee",
};

const VERDICT_LABEL: Record<AgentVerdict, string> = {
  healthy: "healthy",
  caution: "caution",
  critical: "bottleneck",
  neutral: "proposal",
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

function StatusPill({ status, verdict }: { status: AgentStatus; verdict?: AgentVerdict }) {
  if (status === "thinking") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        thinking
      </span>
    );
  }
  if (status === "complete" && verdict) {
    const c = VERDICT_COLOR[verdict];
    return (
      <span
        className="flex items-center gap-1.5 text-[10px] font-mono"
        style={{ color: c }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
        {VERDICT_LABEL[verdict]}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-mono text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        error
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-mono text-slate-600">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
      idle
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
  const borderColor =
    status === "complete" && verdict ? VERDICT_COLOR[verdict] : meta.accent;
  const active = status === "thinking" || status === "complete";

  return (
    <div
      className="rounded-lg border bg-white/[0.02] p-3 transition-all duration-300"
      style={{
        borderColor: active ? `${borderColor}40` : "rgba(255,255,255,0.05)",
        borderLeftWidth: 3,
        borderLeftColor: active ? borderColor : "rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold"
            style={{ color: active ? meta.accent : "#94a3b8" }}
          >
            {meta.name}
          </span>
        </div>
        <StatusPill status={status} verdict={verdict} />
      </div>

      {!active && content === "" ? (
        <p className="text-[11px] text-slate-600">{meta.role}</p>
      ) : (
        <p className="text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap">
          {content}
          {status === "thinking" && (
            <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-cyan-400 animate-pulse" />
          )}
        </p>
      )}

      {/* Orchestrator's proposed next config */}
      {proposal && (
        <div className="mt-3 rounded-md bg-cyan-500/[0.06] border border-cyan-500/20 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
              Proposed Next Config
            </span>
            <span className="text-[10px] font-mono font-semibold text-green-400">
              {proposal.expectedGain}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono">
            <ConfigRow k="clusters" v={proposal.config.n_clusters} />
            <ConfigRow k="L1 sets" v={proposal.config.l1_sets} />
            <ConfigRow k="scheduler" v={SCHED_LABEL[proposal.config.scheduler]} />
            <ConfigRow k="sched/core" v={proposal.config.schedulers_per_core} />
            <ConfigRow k="mem ctrl" v={proposal.config.n_mem} />
            <ConfigRow k="L2 sets" v={proposal.config.l2_sets} />
          </div>
        </div>
      )}
    </div>
  );
}

function ConfigRow({ k, v }: { k: string; v: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      <span className="text-slate-200">{v}</span>
    </div>
  );
}
