"use client";

import { useEffect, useId, useRef, useState } from "react";

interface GoalHealthScoreProps {
  score: number; // 0-100
  label?: string;
  size?: "sm" | "md" | "lg";
}

function getColor(score: number) {
  if (score >= 80) return "#10B981"; // success
  if (score >= 50) return "#F59E0B"; // warning
  return "#EF4444"; // danger
}

function getStatus(score: number): { label: string; description: string } {
  if (score >= 80) return {
    label: "On track",
    description: "This goal is progressing well. Most tasks and milestones are on schedule.",
  };
  if (score >= 50) return {
    label: "Needs attention",
    description: "Some tasks or milestones are delayed, blocked, or overdue. Review progress soon.",
  };
  return {
    label: "At risk",
    description: "Significant blockers, overdue work, or a missed deadline are dragging this goal down.",
  };
}

export function GoalHealthScore({ score, label = "Goal Health", size = "md" }: GoalHealthScoreProps) {
  const [hovered, setHovered] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const color = getColor(clampedScore);
  const dim = size === "sm" ? 80 : size === "lg" ? 140 : 110;
  const strokeWidth = Math.round(dim * 0.14);
  const status = getStatus(clampedScore);

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const showHint = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    setHovered(true);
  };

  const hideHint = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    // Delay hide by 120ms so pointer can move from the trigger onto the tooltip content (WCAG 1.4.13 Hoverable)
    leaveTimerRef.current = setTimeout(() => setHovered(false), 120);
  };

  return (
    <div
      className="relative flex flex-col items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2"
      tabIndex={0}
      {...({ interestfor: tooltipId } as React.HTMLAttributes<HTMLDivElement>)}
      aria-describedby={tooltipId}
      onMouseEnter={showHint}
      onMouseLeave={hideHint}
      onFocus={showHint}
      onBlur={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setHovered(false);
        }
      }}
    >
      <div
        style={{ width: dim, height: dim }}
        className="relative grid place-items-center"
      >
        {/* Native semantic <progress class="progress-ring"> (progress-ring guide) */}
        <progress
          value={clampedScore}
          max={100}
          aria-label={`${label}: ${clampedScore} out of 100 — ${status.label}`}
          aria-valuetext={`${clampedScore} out of 100 (${status.label})`}
          className="progress-ring"
          style={
            {
              "--size": `${dim}px`,
              "--thickness": `${strokeWidth}px`,
              "--fill-color": color,
              "--value": clampedScore,
            } as React.CSSProperties
          }
        />
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="font-bold text-ink" style={{ fontSize: size === "sm" ? 14 : size === "lg" ? 24 : 18 }}>
            {clampedScore}
          </span>
        </div>
      </div>
      <span className="text-xs text-slate">{label}</span>

      {/* Hoverable & Dismissible Tooltip (interest-triggered-tooltips, WCAG 1.4.13) */}
      <div
        id={tooltipId}
        role="tooltip"
        onMouseEnter={showHint}
        onMouseLeave={hideHint}
        className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 bg-ink text-white text-xs rounded-xl px-3 py-2.5 shadow-lg z-50 transition-opacity duration-150 ${
          hovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="font-semibold">{status.label}</span>
          <span className="ml-auto font-bold">{clampedScore}/100</span>
        </div>
        <p className="text-white/70 leading-snug">{status.description}</p>
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" aria-hidden="true" />
      </div>
    </div>
  );
}
