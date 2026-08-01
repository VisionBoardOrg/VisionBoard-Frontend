"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface VelocityChartProps {
  data: { sprint: string; planned: number; completed: number }[];
}

export function VelocityChart({ data }: VelocityChartProps) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15}/>
            <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="completedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="sprint" tick={{ fontSize: 10, fill: "#94A3B8" }} />
        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #E2E8F0" }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Area type="monotone" dataKey="planned" stroke="#2563EB" strokeWidth={2} fill="url(#plannedGrad)" name="Planned" />
        <Area type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2} fill="url(#completedGrad)" name="Completed" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
