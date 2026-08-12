"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Target, Plus, CheckCircle2, Clock, AlertTriangle, Circle,
  ChevronRight, FileText, MessageCircle,
} from "lucide-react";
import { computeGoalHealth } from "@/lib/dashboard-utils";
import { NewGoalModal } from "@/components/goals/NewGoalModal";

const GoalHealthScore = dynamic(
  () => import("@/components/dashboard/GoalHealthScore").then((m) => ({ default: m.GoalHealthScore })),
  { ssr: false }
);

interface Task {
  id: string; status: string; storyPoints: number | null;
}
interface Milestone {
  id: string; title: string; status: string; targetDate: Date | null;
  tasks: Task[];
}
interface Goal {
  id: string; title: string; objective: string; status: string;
  healthScore: number; targetDate: Date | null; keyResults: unknown;
  milestones: Milestone[];
  _count: { documents: number; comments: number };
}

interface GoalsListProps {
  workspaceId: string;
  goals: Goal[];
  canCreate: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-border text-muted",
  active: "bg-blue-faint text-blue",
  completed: "bg-green-100 text-success",
  cancelled: "bg-red-50 text-danger",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={13} className="text-success" />,
  active: <Clock size={13} className="text-blue" />,
  draft: <Circle size={13} className="text-muted" />,
  cancelled: <AlertTriangle size={13} className="text-danger" />,
};

export function GoalsList({ workspaceId, goals: initialGoals, canCreate }: GoalsListProps) {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [showCreate, setShowCreate] = useState(false);

  const statusFilter = ["all", "active", "draft", "completed", "cancelled"] as const;
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "completed" | "cancelled">("all");

  const filtered = filter === "all" ? goals : goals.filter((g) => g.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Goals</h1>
          <p className="text-slate text-sm mt-1">
            {goals.length} goal{goals.length !== 1 ? "s" : ""} · Strategic objectives for this workspace
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="self-start flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
          >
            <Plus size={15} /> New goal
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {statusFilter.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filter === s ? "bg-blue text-white" : "bg-white border border-border text-slate hover:bg-offwhite"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* New Goal modal */}
      {showCreate && (
        <NewGoalModal
          workspaceId={workspaceId}
          extended
          onClose={() => setShowCreate(false)}
          onCreated={(newGoal) => {
            setGoals((prev) => [newGoal as unknown as Goal, ...prev]);
            router.refresh();
          }}
        />
      )}

      {/* Goals grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <Target size={40} className="text-muted mx-auto mb-4" />
          <h3 className="font-semibold text-ink">
            {filter !== "all" ? `No ${filter} goals` : "No goals yet"}
          </h3>
          <p className="text-sm text-slate mt-1 mb-5">
            {filter !== "all"
              ? "Try switching the status filter."
              : "Create your first goal to start aligning your team."}
          </p>
          {canCreate && filter === "all" && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
            >
              <Plus size={14} /> Create first goal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((goal) => {
            const health = computeGoalHealth({
              ...goal,
              milestones: goal.milestones.map((m) => ({
                ...m,
                tasks: m.tasks.map((t) => ({ ...t, storyPoints: t.storyPoints ?? 0 })),
              })),
            } as never);

            const totalTasks = goal.milestones.reduce((sum, m) => sum + m.tasks.length, 0);
            const doneTasks = goal.milestones.reduce(
              (sum, m) => sum + m.tasks.filter((t) => t.status === "done").length,
              0
            );

            return (
              <Link
                key={goal.id}
                href={`/workspace/${workspaceId}/goals/${goal.id}`}
                className="bg-white rounded-2xl border border-border p-6 hover:border-blue/40 hover:shadow-sm transition-all flex flex-col gap-4"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {STATUS_ICON[goal.status]}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[goal.status]}`}>
                        {goal.status}
                      </span>
                      {goal.targetDate && (
                        <span className="text-[10px] text-muted ml-auto">
                          Due {new Date(goal.targetDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-ink leading-snug">{goal.title}</h3>
                    <p className="text-sm text-slate mt-1 line-clamp-2">{goal.objective}</p>
                  </div>
                  <GoalHealthScore score={health} size="sm" />
                </div>

                {/* Progress bar */}
                {totalTasks > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>{doneTasks}/{totalTasks} tasks done</span>
                      <span>{Math.round((doneTasks / totalTasks) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue rounded-full transition-all"
                        style={{ width: `${(doneTasks / totalTasks) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{goal.milestones.length} milestone{goal.milestones.length !== 1 ? "s" : ""}</span>
                    {goal._count.documents > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText size={11} /> {goal._count.documents}
                      </span>
                    )}
                    {goal._count.comments > 0 && (
                      <span className="flex items-center gap-1">
                        <MessageCircle size={11} /> {goal._count.comments}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-muted" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
