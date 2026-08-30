"use client";

import { AlertBanner } from "./AlertBanner";
import { taskStatusCounts } from "@/lib/dashboard-utils";
import type { DashboardWorkspace } from "@/types/dashboard";
import Link from "next/link";

interface EngDashboardProps { workspace: DashboardWorkspace; userId: string; userName: string }

export function EngDashboard({ workspace, userId }: EngDashboardProps) {
  const allTasks = workspace.goals.flatMap((g) => g.milestones.flatMap((m) => m.tasks));
  const counts = taskStatusCounts(allTasks);
  const myTasks = allTasks.filter((t) => t.assigneeId === userId);
  const blockers = allTasks.filter((t) => t.status === "blocked");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink">Engineering Ops</h2>
        <p className="text-slate text-sm mt-1">Milestone tracking and task management for {workspace.name}</p>
      </div>

      {blockers.length > 0 && (
        <AlertBanner
          message={`${blockers.length} task${blockers.length > 1 ? "s are" : " is"} blocked. Unblock them to maintain momentum.`}
          variant="warning"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task overview */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-ink mb-4">Task Overview</h2>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(counts) as [string, number][]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between bg-offwhite rounded-lg px-3 py-2">
                <span className="text-xs text-slate capitalize">{status.replace("_", " ")}</span>
                <span className="text-sm font-bold text-ink">{count}</span>
              </div>
            ))}
          </div>
          <Link href={`/workspace/${workspace.id}/board`} className="mt-4 block text-center text-sm text-blue hover:underline">
            Open board →
          </Link>
        </div>

        {/* My tasks */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-ink mb-4">My tasks ({myTasks.length})</h2>
          <div className="space-y-2">
            {myTasks.length === 0 && <p className="text-sm text-muted">No tasks assigned to you.</p>}
            {myTasks.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-offwhite rounded-lg px-3 py-2">
                <StatusDot status={t.status} />
                <span className="text-sm text-ink truncate flex-1">{t.title}</span>
                <PriorityBadge priority={t.priority ?? "medium"} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: "bg-muted", in_progress: "bg-blue", in_review: "bg-cyan", blocked: "bg-danger", done: "bg-success"
  };
  return <div className={`w-2 h-2 rounded-full shrink-0 ${colors[status] ?? "bg-muted"}`} />;
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, string> = {
    urgent: "bg-red-100 text-danger", high: "bg-amber-100 text-amber-700",
    medium: "bg-blue-light text-blue-deep", low: "bg-border text-muted"
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${styles[priority] ?? "bg-border text-muted"}`}>
      {priority}
    </span>
  );
}
