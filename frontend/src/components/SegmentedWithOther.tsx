import { useState } from "react";

// A segmented control identical in behavior to <Segmented> for the predefined
// options (same onChange call), with one addition: an "Other" pill that reveals
// a text input so the user can type a custom value. Selecting a predefined
// option behaves exactly as before.

interface SegmentedWithOtherProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  placeholder?: string;
}

export function SegmentedWithOther<T extends string | number>({
  options,
  value,
  onChange,
  placeholder = "Custom value",
}: SegmentedWithOtherProps<T>) {
  const numeric = options.length > 0 && typeof options[0].value === "number";
  const isPredefined = options.some((o) => o.value === value);

  const [otherOpen, setOtherOpen] = useState(!isPredefined);
  const [draft, setDraft] = useState(isPredefined ? "" : String(value));
  const [prevValue, setPrevValue] = useState(value);

  // When the parent switches to a predefined value externally (e.g. Reset or an
  // agent proposal), collapse the Other input. React's "derive state during
  // render" pattern — no effect, no change to app state flow.
  if (value !== prevValue) {
    setPrevValue(value);
    if (options.some((o) => o.value === value)) {
      setOtherOpen(false);
      setDraft("");
    }
  }

  const selectOption = (v: T) => {
    setOtherOpen(false);
    setDraft("");
    onChange(v);
  };

  const openOther = () => {
    setDraft(isPredefined ? "" : String(value));
    setOtherOpen(true);
  };

  const onInput = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === "") return;
    if (numeric) {
      const n = Number(raw);
      if (!Number.isNaN(n)) onChange(n as unknown as T);
    } else {
      onChange(raw as unknown as T);
    }
  };

  const pill = (active: boolean) =>
    `seg-pill flex-1 min-w-0 rounded-lg font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis transition-all duration-200 ${
      active
        ? "bg-white text-neutral-900 shadow-sm ring-1 ring-black/[0.04]"
        : "text-neutral-500 hover:text-neutral-800"
    }`;

  return (
    <div>
      <div className="seg-row flex w-full gap-1 rounded-xl bg-neutral-100 p-1">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => selectOption(opt.value)}
            className={pill(value === opt.value && !otherOpen)}
            title={opt.label}
          >
            {opt.label}
          </button>
        ))}
        <button onClick={openOther} className={pill(otherOpen)} title="Other">
          Other
        </button>
      </div>
      {otherOpen && (
        <input
          type="text"
          inputMode={numeric ? "numeric" : "text"}
          value={draft}
          onChange={(e) => onInput(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 transition-shadow"
        />
      )}
    </div>
  );
}
