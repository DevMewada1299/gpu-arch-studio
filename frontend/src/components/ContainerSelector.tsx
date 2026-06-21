import { useEffect, useRef, useState } from "react";
import type { Container } from "../types";
import { mockContainers } from "../mocks";

interface ContainerSelectorProps {
  containers?: Container[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export default function ContainerSelector({
  containers = mockContainers,
  selected,
  onChange,
}: ContainerSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  const idleCount = containers.filter((c) => c.status === "idle").length;
  const selectIdle = () =>
    onChange(containers.filter((c) => c.status === "idle").map((c) => c.id));

  const n = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/80 border border-white/[0.08] text-xs text-slate-300 hover:border-slate-600 transition-colors"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            n > 0 ? "bg-green-400" : "bg-slate-600"
          }`}
        />
        <span className="font-mono">
          {n} {n === 1 ? "Container" : "Containers"}
        </span>
        <span className="text-slate-500 ml-0.5">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-lg border border-white/[0.08] bg-[#0B1020] shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
              Parallel Containers
            </span>
            <span className="text-[10px] font-mono text-slate-600">
              {idleCount} idle
            </span>
          </div>

          <div className="py-1 max-h-56 overflow-y-auto">
            {containers.map((c) => {
              const isSelected = selected.includes(c.id);
              const busy = c.status === "busy";
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <span
                    className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded border flex-none ${
                      isSelected
                        ? "bg-cyan-500 border-cyan-500 text-slate-900"
                        : "border-white/15"
                    }`}
                  >
                    {isSelected && <span className="text-[9px] leading-none">✓</span>}
                  </span>
                  <span className="flex-1 font-mono text-xs text-slate-300 truncate">
                    {c.name}
                  </span>
                  <span
                    className={`flex items-center gap-1 text-[10px] font-mono flex-none ${
                      busy ? "text-amber-400" : "text-green-400"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        busy ? "bg-amber-400 animate-pulse" : "bg-green-400"
                      }`}
                    />
                    {c.status}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-3 py-2 border-t border-white/[0.06] flex items-center justify-between">
            <button
              onClick={selectIdle}
              className="text-[10px] font-mono text-cyan-500/80 hover:text-cyan-400 transition-colors"
            >
              select all idle
            </button>
            <span className="text-[10px] font-mono text-slate-600">
              {n} selected · {n > 1 ? `${n}× parallel` : "single"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
