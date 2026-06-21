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
    <div className="flex w-full rounded-xl bg-neutral-100 p-1 gap-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-1.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              active
                ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/[0.04]"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
