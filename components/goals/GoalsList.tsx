"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Target, Plus, CheckCircle2, Clock, AlertTriangle, Circle,
  ChevronRight, FileText, MessageCircle, X, Loader2
} from "lucide-react";
import { GoalHealthScore } from "@/components/dashboard/GoalHealthScore";
import { computeGoalHealth } from "@/lib/dashboard-utils";

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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [form, setForm] = useState({ title: "", objective: "", targetDate: "", status: "active" as const });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.objective.trim()) return;
    setCreating(true);
    setCreateError("");

    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title: form.title.trim(),
        objective: form.objective.trim(),
        targetDate: form.targetDate || null,
        status: form.status,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setCreateError(data.error || "Failed to create goal.");
      setCreating(false);
      return;
    }

    // Optimistic add with empty counts
    setGoals((prev) => [{ ...data.goal, milestones: [], _count: { documents: 0, comments: 0 } }, ...prev]);
    setForm({ title: "", objective: "", targetDate: "", status: "active" });
    setShowCreate(false);
    setCreating(false);
    router.refresh();
  }

  const statusFilter = ["all", "active", "draft", "completed", "cancelled"] as const;
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "completed" | "cancelled">("all");

  const filtered = filter === "all" ? goals : goals.filter((g) => g.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Goals</h1>
          <p className="text-slate text-sm mt-1">
            {goals.length} goal{goals.length !== 1 ? "s" : ""} · Strategic objectives for this workspace
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
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

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl border border-border shadow-2xl p-8 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-ink">New Goal</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted hover:text-ink transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                  {createError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Goal title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Launch v2 product by Q4"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Objective</label>
                <textarea
                  required
                  rows={3}
                  value={form.objective}
                  onChange={(e) => setForm({ ...form, objective: e.target.value })}
                  placeholder="What does success look like?"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Target date</label>
                  <input
                    type="date"
                    value={form.targetDate}
                    onChange={(e) => setForm({ ...form, targetDate: e.target.value })}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as "active" })}
                    className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-blue text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : "Create goal"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-5 border border-border rounded-xl text-sm text-slate hover:bg-offwhite transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
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
