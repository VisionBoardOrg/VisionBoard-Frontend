import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    direction: "up" | "down" | "flat";
    label: string;
    positive?: boolean; // whether "up" is good for this metric
  };
  icon?: LucideIcon;
  iconColor?: string;
  className?: string;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  iconColor = "text-blue",
  className = "",
}: MetricCardProps) {
  const getTrendColor = () => {
    if (!trend) return "text-muted";
    if (trend.direction === "flat") return "text-muted";
    const isPositive =
      trend.positive !== undefined
        ? (trend.direction === "up") === trend.positive
        : trend.direction === "up";
    return isPositive ? "text-success" : "text-danger";
  };

  const TrendIcon =
    trend?.direction === "up"
      ? TrendingUp
      : trend?.direction === "down"
      ? TrendingDown
      : Minus;

  return (
    <div
      className={`bg-white border border-border rounded-2xl p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-xs font-semibold text-slate uppercase tracking-wide truncate">
          {title}
        </p>
        {Icon && (
          <div className={`w-8 h-8 rounded-lg bg-blue-faint flex items-center justify-center shrink-0`}>
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
        )}
      </div>

      <p className="text-2xl font-extrabold text-ink tracking-tight">
        {value}
      </p>

      {(subtitle || trend) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {trend && (
            <span className={`flex items-center gap-1 text-xs font-semibold ${getTrendColor()}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {trend.label}
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-muted font-medium">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
