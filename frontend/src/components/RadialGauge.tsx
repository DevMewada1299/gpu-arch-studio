import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";

interface RadialGaugeProps {
  value: number;      // 0..1
  label: string;
  color: string;      // hex
  display?: string;   // override center text (defaults to pct)
}

export default function RadialGauge({ value, label, color, display }: RadialGaugeProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const data = [{ name: label, value: pct, fill: color }];

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-full aspect-square max-h-[88px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="74%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
            barSize={6}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: "rgba(255,255,255,0.05)" }}
              dataKey="value"
              cornerRadius={6}
              angleAxisId={0}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        {/* Center value */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-mono font-bold" style={{ color }}>
            {display ?? `${pct.toFixed(0)}%`}
          </span>
        </div>
      </div>
      <span className="mt-1 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
