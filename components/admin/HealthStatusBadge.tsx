type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

interface HealthStatusBadgeProps {
  status: HealthStatus;
  label?: string;
  showDot?: boolean;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { bg: string; text: string; dot: string; label: string }
> = {
  healthy:  { bg: "bg-success/10", text: "text-success",  dot: "bg-success",  label: "Healthy"  },
  degraded: { bg: "bg-warning/10", text: "text-warning",  dot: "bg-warning",  label: "Degraded" },
  down:     { bg: "bg-danger/10",  text: "text-danger",   dot: "bg-danger",   label: "Down"     },
  unknown:  { bg: "bg-muted/10",   text: "text-muted",    dot: "bg-muted",    label: "Unknown"  },
};

export default function HealthStatusBadge({
  status,
  label,
  showDot = true,
  size = "md",
}: HealthStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold border ${
        config.bg
      } ${config.text} ${sizeClass}`}
      style={{ borderColor: "transparent" }}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${config.dot} ${
            status === "healthy" ? "animate-pulse" : ""
          }`}
        />
      )}
      {label ?? config.label}
    </span>
  );
}
