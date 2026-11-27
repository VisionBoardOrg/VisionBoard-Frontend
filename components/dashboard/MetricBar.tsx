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
          <progress
            aria-label={label}
            value={Math.max(0, Math.min(100, value))}
            max={100}
            style={{ "--progress-bar-fill": color } as React.CSSProperties}
            className="styled-progress h-2 w-full block"
          />
        </div>
      ))}
    </div>
  );
}
