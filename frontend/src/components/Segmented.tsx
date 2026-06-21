// A small reusable segmented-button control for discrete enumerated values.

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="flex w-full rounded-md bg-black/30 border border-white/[0.06] p-0.5 gap-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-1 py-1 rounded text-[11px] font-mono transition-colors ${
              active
                ? "bg-cyan-500/90 text-slate-900 font-semibold shadow-[0_0_8px_rgba(34,211,238,0.3)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
