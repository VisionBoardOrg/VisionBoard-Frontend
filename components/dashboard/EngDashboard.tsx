"use client";

import { AlertBanner } from "./AlertBanner";
import { taskStatusCounts } from "@/lib/dashboard-utils";
import type { DashboardWorkspace } from "@/types/dashboard";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface EngDashboardProps { workspace: DashboardWorkspace; userId: string; userName: string }

const STATUS_META: Record<string, { label: string; dotClass: string }> = {
  todo: { label: "To do", dotClass: "bg-muted" },
  in_progress: { label: "In progress", dotClass: "bg-blue" },
  in_review: { label: "In review", dotClass: "bg-cyan" },
  blocked: { label: "Blocked", dotClass: "bg-danger" },
  done: { label: "Done", dotClass: "bg-success" },
};

export function EngDashboard({ workspace, userId }: EngDashboardProps) {
  const needsFallbackScan = !workspace.taskStats?.byStatus || !workspace.myTasks;
  const allTasks = needsFallbackScan
    ? workspace.goals.flatMap((g) => g.milestones.flatMap((m) => m.tasks))
    : [];
  const counts = workspace.taskStats?.byStatus ?? taskStatusCounts(allTasks);
  const myTasks =
    workspace.myTasks ??
    allTasks.filter((t) => t.assignees.some((a) => a.userId === userId));
  const myTasksTotal = workspace.myTasksTotal ?? myTasks.length;
  const blockedCount = workspace.taskStats?.blocked ?? counts.blocked;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Engineering Ops</h2>
        <p className="text-slate text-sm mt-1">Milestone tracking and task management for {workspace.name}</p>
      </div>

      {blockedCount > 0 && (
        <AlertBanner
          message={`${blockedCount} task${blockedCount > 1 ? "s are" : " is"} blocked. Unblock them to maintain momentum.`}
          variant="warning"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task overview */}
        <div className="bg-white rounded-2xl border border-border p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-ink mb-4">Task Overview</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(counts) as [string, number][]).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between bg-offwhite rounded-lg px-3 py-2">
                  <span className="text-xs text-slate">{STATUS_META[status]?.label ?? status.replace("_", " ")}</span>
                  <span className="text-sm font-bold text-ink">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <Link
            href={`/workspace/${workspace.id}/board`}
            className="mt-4 inline-flex items-center justify-center gap-1 text-sm font-medium text-blue hover:underline"
          >
            Open board <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        {/* My tasks */}
        <div className="bg-white rounded-2xl border border-border p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-ink mb-4">My tasks ({myTasksTotal})</h3>
            <div className="space-y-2">
              {myTasks.length === 0 && (
                <p className="text-sm text-muted">No tasks assigned to you yet.</p>
              )}
              {myTasks.slice(0, 6).map((t) => (
                <Link
                  key={t.id}
                  href={`/workspace/${workspace.id}/tasks`}
                  className="flex items-center gap-3 bg-offwhite hover:bg-blue-faint/60 border border-transparent hover:border-blue-light rounded-lg px-3 py-2 transition-colors group"
                >
                  <StatusDot status={t.status} />
                  <span className="text-sm text-ink group-hover:text-blue truncate flex-1 transition-colors">{t.title}</span>
                  <PriorityBadge priority={t.priority ?? "medium"} />
                </Link>
              ))}
            </div>
          </div>
          {myTasksTotal > 0 && (
            <Link
              href={`/workspace/${workspace.id}/tasks`}
              className="mt-4 inline-flex items-center justify-center gap-1 text-sm font-medium text-blue hover:underline"
            >
              {myTasksTotal > 6 ? `View all ${myTasksTotal} tasks` : "View all tasks"} <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status.replace("_", " "), dotClass: "bg-muted" };
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0" title={meta.label}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} aria-hidden="true" />
      <span className="text-[10px] font-medium text-slate hidden sm:inline">{meta.label}</span>
      <span className="sr-only sm:hidden">Status: {meta.label}</span>
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    urgent: "bg-red-100 text-danger", high: "bg-amber-100 text-amber-700",
    medium: "bg-blue-light text-blue-deep", low: "bg-border text-muted"
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize shrink-0 ${styles[priority] ?? "bg-border text-muted"}`}>
      {priority}
    </span>
  );
}
