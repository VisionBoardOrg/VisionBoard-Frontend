"use client";

import { useState } from "react";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

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
  const color = getColor(score);
  const dim = size === "sm" ? 80 : size === "lg" ? 140 : 110;
  const status = getStatus(score);

  const data = [
    { name: "score", value: score, fill: color },
    { name: "bg", value: 100 - score, fill: "#E2E8F0" },
  ];

  return (
    <div
      className="relative flex flex-col items-center gap-1"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: dim, height: dim }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={6} background={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold text-ink" style={{ fontSize: size === "sm" ? 14 : size === "lg" ? 24 : 18 }}>
            {score}
          </span>
        </div>
      </div>
      <span className="text-xs text-slate">{label}</span>

      {/* Tooltip */}
      {hovered && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-52 bg-ink text-white text-xs rounded-xl px-3 py-2.5 shadow-lg z-50 pointer-events-none">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="font-semibold">{status.label}</span>
            <span className="ml-auto font-bold">{score}/100</span>
          </div>
          <p className="text-white/70 leading-snug">{status.description}</p>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
        </div>
      )}
    </div>
  );
}
