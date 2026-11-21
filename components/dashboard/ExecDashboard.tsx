"use client";

import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { MetricBar } from "./MetricBar";
import { GoalHealthScore } from "./GoalHealthScore";
import { formatRoleLabel } from "@/lib/roles";
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

  const allMilestones = goals.flatMap((g) => g.milestones);
  const completedMilestones = allMilestones.filter((m) => m.status === "completed").length;
  const milestonesDonePercent =
    allMilestones.length > 0 ? Math.round((completedMilestones / allMilestones.length) * 100) : 0;

  const donePercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  // Health scores are persisted by the sweeper cron — no client recomputation
  const avgHealth = goals.length
    ? Math.round(goals.reduce((sum, g) => sum + (g.healthScore ?? 0), 0) / goals.length)
    : 0;

  const rollup = [
    { label: "Goal Health", value: avgHealth, color: "#2563EB" },
    { label: "Milestones Done", value: milestonesDonePercent, color: "#0EA5E9" },
    { label: "Tasks Done", value: donePercent, color: "#10B981" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Executive Overview</h2>
        <p className="text-slate text-sm mt-1">Company-wide progress for {workspace.name}</p>
      </div>

      {/* Company Health Rollup */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-ink">Company Health Rollup</h3>
          {goals.length > 0 && <GoalHealthScore score={avgHealth} size="sm" label="Org Health" />}
        </div>
        {goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-faint text-blue flex items-center justify-center mb-3">
              <Target size={20} aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-ink">No goals tracked yet</p>
            <p className="text-xs text-slate mt-1 mb-4 max-w-sm">
              Create your first strategic goal and milestones to populate company-wide health metrics.
            </p>
            <Link
              href={`/workspace/${workspace.id}/goals`}
              className="inline-flex items-center gap-1.5 bg-blue text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-blue-mid transition-colors"
            >
              Create your first goal <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <MetricBar metrics={rollup} />
        )}
      </div>

      {/* Team alignment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-border p-5 flex flex-col justify-between">
          <div>
            <div className="text-3xl font-bold text-ink">{workspace._count.members}</div>
            <div className="text-sm text-muted mt-1">Team members</div>
            <div className="mt-3 space-y-1.5">
              {workspace.members.slice(0, 4).map((m) => (
                <div key={m.userId} className="flex items-center gap-2 text-xs text-slate">
                  <div className="w-5 h-5 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold uppercase text-[9px] shrink-0">
                    {m.user.name?.[0] ?? "?"}
                  </div>
                  <span className="truncate">{m.user.name}</span>
                  <span className="ml-auto text-muted shrink-0">{formatRoleLabel(m.role)}</span>
                </div>
              ))}
            </div>
          </div>
          <Link
            href={`/workspace/${workspace.id}/settings`}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
          >
            Manage team <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 flex flex-col justify-between">
          <div>
            <div className="text-3xl font-bold text-ink">{workspace._count.goals}</div>
            <div className="text-sm text-muted mt-1">Active goals</div>
            {goals.length === 0 ? (
              <p className="mt-3 text-xs text-slate">No active goals yet.</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {goals.slice(0, 3).map((g) => {
                  const h = g.healthScore ?? 0;
                  return (
                    <div key={g.id} className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full shrink-0 ${h >= 70 ? "bg-success" : h >= 40 ? "bg-warning" : "bg-danger"}`}
                        aria-hidden="true"
                      />
                      <span className="text-xs text-slate truncate flex-1">{g.title}</span>
                      <span className="text-xs font-semibold text-ink shrink-0">{h}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <Link
            href={`/workspace/${workspace.id}/goals`}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
          >
            View all goals <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-border p-5 flex flex-col justify-between">
          <div>
            <div className="text-3xl font-bold text-ink">{blockedTasks}</div>
            <div className="text-sm text-muted mt-1">Blockers across all goals</div>
            <div className="mt-2 text-xs text-slate">
              {blockedTasks === 0
                ? "No blockers — great execution!"
                : `${blockedTasks} blocked task${blockedTasks !== 1 ? "s" : ""} need attention.`}
            </div>
          </div>
          <Link
            href={`/workspace/${workspace.id}/board`}
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue hover:underline"
          >
            {blockedTasks > 0 ? "Review blockers on the Board" : "Open Board"} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
