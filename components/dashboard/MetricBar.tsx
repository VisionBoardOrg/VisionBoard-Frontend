"use client";

interface MetricBarProps {
  metrics: { label: string; value: number; color?: string }[];
}

export function MetricBar({ metrics }: MetricBarProps) {
  return (
    <div className="space-y-3">
      {metrics.map(({ label, value, color = "#2563EB" }) => (
        <div key={label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-slate">{label}</span>
            <span className="text-sm font-semibold text-ink">{value}%</span>
          </div>
          <div className="h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${value}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
