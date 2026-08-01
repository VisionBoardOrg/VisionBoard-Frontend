"use client";

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

export function GoalHealthScore({ score, label = "Goal Health", size = "md" }: GoalHealthScoreProps) {
  const color = getColor(score);
  const dim = size === "sm" ? 80 : size === "lg" ? 140 : 110;

  const data = [
    { name: "score", value: score, fill: color },
    { name: "bg", value: 100 - score, fill: "#E2E8F0" },
  ];

  return (
    <div className="flex flex-col items-center gap-1">
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
    </div>
  );
}
