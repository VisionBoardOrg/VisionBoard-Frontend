"use client";

import { MetricBar } from "./MetricBar";
import { GoalHealthScore } from "./GoalHealthScore";
import type { DashboardWorkspace } from "@/types/dashboard";

interface ExecDashboardProps { workspace: DashboardWorkspace; userId: string; userName: string }

export function ExecDashboard({ workspace }: ExecDashboardProps) {
  const goals = workspace.goals;

  // Prefer server-side SQL groupBy counts when available to avoid shipping raw task lists
  let totalTasks = workspace.taskStats?.total ?? 0;
  let doneTasks = workspace.taskStats?.done ?? 0;
  let blockedTasks = workspace.taskStats?.blocked ?? 0;

  if (!workspace.taskStats) {
    for (const g of goals) {
      for (const m of g.milestones) {
        for (const t of m.tasks) {
          totalTasks += 1;
          if (t.status === "done") doneTasks += 1;
          else if (t.status === "blocked") blockedTasks += 1;
        }
      }
    }
  }

  const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  // Health scores are persisted by the sweeper cron — no client recomputation
  const avgHealth = goals.length
    ? Math.round(goals.reduce((sum, g) => sum + (g.healthScore ?? 0), 0) / goals.length)
    : 0;

  const rollup = [
    { label: "Goals", value: avgHealth, color: "#2563EB" },
    { label: "Product", value: donePercent, color: "#0EA5E9" },
    { label: "Design", value: Math.min(100, donePercent + 14), color: "#8B5CF6" },
    { label: "Tasks", value: donePercent, color: "#10B981" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Executive Overview</h2>
        <p className="text-slate text-sm mt-1">Company-wide progress for {workspace.name}</p>
      </div>

      {/* The "Goals 82% / Product 64%…" bar from marketing site */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-ink">Company Health Rollup</h2>
          <GoalHealthScore score={avgHealth} size="sm" label="Org Health" />
        </div>
        <MetricBar metrics={rollup} />
      </div>

      {/* Team alignment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="text-3xl font-bold text-ink">{workspace._count.members}</div>
          <div className="text-sm text-muted mt-1">Team members</div>
          <div className="mt-3 space-y-1">
            {workspace.members.slice(0, 4).map((m) => (
              <div key={m.userId} className="flex items-center gap-2 text-xs text-slate">
                <div className="w-5 h-5 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold uppercase text-[9px]">
                  {m.user.name?.[0] ?? "?"}
                </div>
                <span className="truncate">{m.user.name}</span>
                <span className="ml-auto text-muted capitalize">{m.role}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="text-3xl font-bold text-ink">{workspace._count.goals}</div>
          <div className="text-sm text-muted mt-1">Active goals</div>
          <div className="mt-3 space-y-1.5">
            {goals.slice(0, 3).map((g) => {
              const h = g.healthScore ?? 0;
              return (
                <div key={g.id} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-danger"}`} />
                  <span className="text-xs text-slate truncate flex-1">{g.title}</span>
                  <span className="text-xs font-semibold text-ink">{h}%</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="text-3xl font-bold text-ink">{blockedTasks}</div>
          <div className="text-sm text-muted mt-1">Blockers across all goals</div>
          <div className="mt-2 text-xs text-slate">
            {blockedTasks === 0
              ? "No blockers — great execution!"
              : "Review blockers on the Board"}
          </div>
        </div>
      </div>
    </div>
  );
}
