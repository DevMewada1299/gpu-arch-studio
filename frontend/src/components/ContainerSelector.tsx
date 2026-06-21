import { useEffect, useRef, useState } from "react";
import { ChevronDown, Server, Check } from "lucide-react";
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

  const idleCount = containers.filter((c) => !c.busy).length;
  const selectIdle = () =>
    onChange(containers.filter((c) => !c.busy).map((c) => c.id));

  const n = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50 transition-colors"
      >
        <Server size={14} className="text-neutral-400" />
        <span className="font-medium">
          {n} {n === 1 ? "Container" : "Containers"}
        </span>
        <ChevronDown
          size={14}
          className={`text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-neutral-200 bg-white shadow-lg shadow-black/[0.06] z-50 overflow-hidden animate-fade-in-up">
          <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-neutral-700">
              Parallel Containers
            </span>
            <span className="text-[11px] text-neutral-400">{idleCount} idle</span>
          </div>

          <div className="py-1.5 max-h-60 overflow-y-auto">
            {containers.map((c) => {
              const isSelected = selected.includes(c.id);
              const busy = c.busy;
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left"
                >
                  <span
                    className={`inline-flex items-center justify-center w-4 h-4 rounded-md border flex-none transition-colors ${
                      isSelected
                        ? "bg-indigo-600 border-indigo-600 text-white"
                        : "border-neutral-300"
                    }`}
                  >
                    {isSelected && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 text-[13px] text-neutral-700 truncate">
                    {c.name}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium flex-none ${
                      busy ? "text-amber-600" : "text-emerald-600"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        busy ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                    {busy ? "busy" : "idle"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-4 py-2.5 border-t border-neutral-100 flex items-center justify-between">
            <button
              onClick={selectIdle}
              className="text-[12px] font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Select all idle
            </button>
            <span className="text-[11px] text-neutral-400">
              {n > 1 ? `${n}× parallel` : "single"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
