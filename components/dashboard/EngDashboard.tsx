"use client";

import { Goal, Milestone, Sprint, Task, Workspace, WorkspaceMember, User } from "@prisma/client";
import dynamic from "next/dynamic";
import { AlertBanner } from "./AlertBanner";
import { computeSprintVelocity, taskStatusCounts } from "@/lib/dashboard-utils";
import Link from "next/link";

const VelocityChart = dynamic(
  () => import("./VelocityChart").then((m) => ({ default: m.VelocityChart })),
  { ssr: false }
);

type FullWorkspace = Workspace & {
  goals: (Goal & { milestones: (Milestone & { tasks: Task[] })[] })[];
  sprints: (Sprint & { tasks: Task[] })[];
  members: (WorkspaceMember & { user: User })[];
  _count: { goals: number; documents: number; members: number };
};

interface EngDashboardProps { workspace: FullWorkspace; userId: string; userName: string }

export function EngDashboard({ workspace, userId }: EngDashboardProps) {
  const activeSprint = workspace.sprints[0];
  const sprintTasks = activeSprint?.tasks ?? [];
  const counts = taskStatusCounts(sprintTasks);
  const { planned, completed } = computeSprintVelocity(sprintTasks);
  const myTasks = sprintTasks.filter((t) => t.assigneeId === userId);

  const velocityData = workspace.sprints.map((s) => {
    const v = computeSprintVelocity(s.tasks);
    return { sprint: s.name.split(" — ")[0], ...v };
  });

  const allTasks = workspace.goals.flatMap(g => g.milestones.flatMap(m => m.tasks));
  const blockers = allTasks.filter(t => t.status === "blocked");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Engineering Ops</h1>
        <p className="text-slate text-sm mt-1">Sprint tracking and velocity for {workspace.name}</p>
      </div>

      {blockers.length > 0 && (
        <AlertBanner
          message={`${blockers.length} task${blockers.length > 1 ? "s are" : " is"} blocked. Unblock them to maintain sprint velocity.`}
          variant="warning"
        />
      )}

      {/* Sprint velocity */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-ink mb-4">Sprint Velocity</h2>
        <VelocityChart data={velocityData} />
        <div className="flex gap-4 mt-3 text-xs text-muted">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue inline-block rounded" /> Planned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-success inline-block rounded" /> Completed</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current sprint */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-ink mb-1">{activeSprint?.name ?? "No active sprint"}</h2>
          {activeSprint && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue rounded-full"
                    style={{ width: `${planned ? Math.round((completed / planned) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-ink">{completed}/{planned} pts</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(counts) as [string, number][]).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between bg-offwhite rounded-lg px-3 py-2">
                    <span className="text-xs text-slate capitalize">{status.replace("_", " ")}</span>
                    <span className="text-sm font-bold text-ink">{count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <Link href={`/workspace/${workspace.id}/board`} className="mt-4 block text-center text-sm text-blue hover:underline">
            Open board →
          </Link>
        </div>

        {/* My tasks */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-ink mb-4">My tasks this sprint ({myTasks.length})</h2>
          <div className="space-y-2">
            {myTasks.length === 0 && <p className="text-sm text-muted">No tasks assigned to you this sprint.</p>}
            {myTasks.slice(0, 6).map((t) => (
              <div key={t.id} className="flex items-center gap-3 bg-offwhite rounded-lg px-3 py-2">
                <StatusDot status={t.status} />
                <span className="text-sm text-ink truncate flex-1">{t.title}</span>
                <PriorityBadge priority={t.priority} />
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
