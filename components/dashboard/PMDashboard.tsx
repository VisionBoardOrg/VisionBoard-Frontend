"use client";

import { Goal, Milestone, Sprint, Task, Workspace, WorkspaceMember, User } from "@prisma/client";
import dynamic from "next/dynamic";

const GoalHealthScore = dynamic(
  () => import("./GoalHealthScore").then((m) => ({ default: m.GoalHealthScore })),
  { ssr: false }
);

import { MetricBar } from "./MetricBar";
import { AlertBanner } from "./AlertBanner";
import { computeGoalHealth } from "@/lib/dashboard-utils";
import Link from "next/link";
import { ArrowRight, Zap, Target, HeartPulse, Users, FileText } from "lucide-react";

type FullWorkspace = Workspace & {
  goals: (Goal & { milestones: (Milestone & { tasks: Task[] })[] })[];
  sprints: (Sprint & { tasks: Task[] })[];
  members: (WorkspaceMember & { user: User })[];
  _count: { goals: number; documents: number; members: number };
};

interface PMDashboardProps {
  workspace: FullWorkspace;
  userId: string;
  userName: string;
}

export function PMDashboard({ workspace, userName }: PMDashboardProps) {
  const goals = workspace.goals;
  const avgHealth =
    goals.length > 0
      ? Math.round(goals.reduce((sum, g) => sum + computeGoalHealth(g), 0) / goals.length)
      : 0;

  const activeSprint = workspace.sprints[0];
  const sprintTasks = activeSprint?.tasks ?? [];
  const blockers = sprintTasks.filter((t) => t.status === "blocked").length;

  const roadmapHealth = goals.map((g) => ({
    label: g.title.length > 28 ? g.title.slice(0, 28) + "…" : g.title,
    value: computeGoalHealth(g),
  }));

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Good day, {userName}</h1>
        <p className="text-slate text-sm mt-1">Here&apos;s your product workspace overview.</p>
      </div>

      {/* AI Risk alert */}
      {blockers > 0 && (
        <AlertBanner
          message={`${blockers} task${blockers > 1 ? "s are" : " is"} currently blocked in the active sprint. Check the board for details.`}
          variant="warning"
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Active Goals" value={workspace._count.goals} icon={Target} />
        <KPICard label="Overall Health" value={`${avgHealth}%`} icon={HeartPulse} />
        <KPICard label="Team Members" value={workspace._count.members} icon={Users} />
        <KPICard label="Connected Docs" value={workspace._count.documents} icon={FileText} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goal Health Scores */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-ink">Goal Health</h2>
            <GoalHealthScore score={avgHealth} label="Avg" size="sm" />
          </div>
          <MetricBar metrics={roadmapHealth} />
          <Link
            href={`/workspace/${workspace.id}/roadmap`}
            className="mt-4 flex items-center gap-1 text-sm text-blue hover:underline"
          >
            View full roadmap <ArrowRight size={14} />
          </Link>
        </div>

        {/* Active Sprint */}
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-ink mb-1">
            {activeSprint ? activeSprint.name : "No active sprint"}
          </h2>
          {activeSprint && (
            <>
              <p className="text-xs text-muted mb-4">
                {new Date(activeSprint.startDate).toLocaleDateString()} –{" "}
                {new Date(activeSprint.endDate).toLocaleDateString()}
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(["todo", "in_progress", "blocked", "done"] as const).map((s) => {
                  const count = sprintTasks.filter((t) => t.status === s).length;
                  return (
                    <div key={s} className="bg-offwhite rounded-xl p-3 text-center">
                      <div className="text-xl font-bold text-ink">{count}</div>
                      <div className="text-xs text-muted capitalize">{s.replace("_", " ")}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* AI Insights CTA */}
          <button className="mt-4 w-full flex items-center justify-center gap-2 border border-blue/30 text-blue rounded-xl py-2.5 text-sm font-medium hover:bg-blue-faint transition-colors">
            <Zap size={14} />
            Generate AI insights
          </button>
        </div>
      </div>
    </div>
  );
}

function KPICard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="bg-white rounded-2xl border border-border p-5">
      <div className="w-9 h-9 rounded-xl bg-blue/10 text-blue flex items-center justify-center mb-3">
        <Icon size={18} />
      </div>
      <div className="text-2xl font-bold text-ink">{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

