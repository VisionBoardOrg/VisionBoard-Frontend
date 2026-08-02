import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { Target, Plus, CheckCircle2, Circle, Clock, AlertTriangle, ChevronRight } from "lucide-react";

interface GoalsPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: GoalsPageProps) {
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: `Goals — ${workspace?.name ?? "VisionBoard"}` };
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  draft: { label: "Draft", icon: <Circle size={13} className="text-muted" />, color: "bg-slate-100 text-slate-600" },
  active: { label: "Active", icon: <Clock size={13} className="text-blue" />, color: "bg-blue-faint text-blue" },
  completed: { label: "Completed", icon: <CheckCircle2 size={13} className="text-success" />, color: "bg-green-50 text-success" },
  cancelled: { label: "Cancelled", icon: <AlertTriangle size={13} className="text-danger" />, color: "bg-red-50 text-danger" },
};

function HealthBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-muted w-8 text-right">{score}%</span>
    </div>
  );
}

export default async function GoalsPage({ params }: GoalsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const goals = await prisma.goal.findMany({
    where: { workspaceId: id },
    include: {
      milestones: {
        include: { tasks: { select: { id: true, status: true } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const canCreate = member.role === "admin" || member.role === "pm";

  return (
    <AppShell workspaceId={id} role={session.user.role}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">Goals</h1>
            <p className="text-slate text-sm mt-1">
              Track objectives and key results across your workspace
            </p>
          </div>
          {canCreate && (
            <Link
              href={`/workspace/${id}/board`}
              className="flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
            >
              <Plus size={15} /> New goal
            </Link>
          )}
        </div>

        {/* Summary strip */}
        {goals.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(["draft", "active", "completed", "cancelled"] as const).map((status) => {
              const count = goals.filter((g) => g.status === status).length;
              const meta = STATUS_META[status];
              return (
                <div key={status} className="bg-white rounded-2xl border border-border p-4">
                  <div className="flex items-center gap-1.5 text-xs text-slate mb-1">
                    {meta.icon}
                    <span>{meta.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-ink">{count}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Goals list */}
        {goals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <Target size={40} className="text-muted mx-auto mb-4" />
            <h3 className="font-semibold text-ink">No goals yet</h3>
            <p className="text-sm text-slate mt-1 mb-5">
              Goals are created from the board. Head there to add your first goal card.
            </p>
            <Link
              href={`/workspace/${id}/board`}
              className="inline-flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
            >
              <Plus size={14} /> Go to board
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => {
              const totalTasks = goal.milestones.reduce((sum, m) => sum + m.tasks.length, 0);
              const doneTasks = goal.milestones.reduce(
                (sum, m) => sum + m.tasks.filter((t) => t.status === "done").length,
                0
              );
              const completedMilestones = goal.milestones.filter(
                (m) => m.status === "completed"
              ).length;
              const meta = STATUS_META[goal.status] ?? STATUS_META.draft;

              return (
                <Link
                  key={goal.id}
                  href={`/workspace/${id}/goals/${goal.id}`}
                  className="group block bg-white rounded-2xl border border-border p-5 hover:border-blue/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-xl bg-blue-faint flex items-center justify-center shrink-0">
                      <Target size={16} className="text-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-semibold text-ink truncate">{goal.title}</h2>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${meta.color}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate line-clamp-1 mb-3">{goal.objective}</p>

                      <HealthBar score={goal.healthScore} />

                      <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                        <span>{goal.milestones.length} milestones ({completedMilestones} done)</span>
                        {totalTasks > 0 && (
                          <span>{doneTasks}/{totalTasks} tasks</span>
                        )}
                        {goal.targetDate && (
                          <span>Due {new Date(goal.targetDate).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-muted shrink-0 group-hover:text-blue transition-colors mt-1"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
