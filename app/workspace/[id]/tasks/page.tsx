import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  ChevronRight, ListTodo, Flame, ArrowUp, ArrowDown, Minus
} from "lucide-react";
import { TaskStatusDropdown } from "@/components/tasks/TaskStatusDropdown";

interface TasksPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TasksPageProps) {
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: `My Tasks — ${workspace?.name ?? "VisionBoard"}` };
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  todo: { label: "To Do", icon: <Circle size={13} className="text-muted" />, color: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", icon: <Clock size={13} className="text-blue" />, color: "bg-blue-faint text-blue" },
  in_review: { label: "In Review", icon: <Clock size={13} className="text-cyan" />, color: "bg-cyan-50 text-cyan-700" },
  blocked: { label: "Blocked", icon: <AlertTriangle size={13} className="text-danger" />, color: "bg-red-50 text-danger" },
  done: { label: "Done", icon: <CheckCircle2 size={13} className="text-success" />, color: "bg-green-50 text-success" },
};

const PRIORITY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: "Urgent", icon: <Flame size={12} />, color: "text-danger" },
  high: { label: "High", icon: <ArrowUp size={12} />, color: "text-warning" },
  medium: { label: "Medium", icon: <Minus size={12} />, color: "text-slate" },
  low: { label: "Low", icon: <ArrowDown size={12} />, color: "text-muted" },
};

export default async function TasksPage({ params }: TasksPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: session.user.id,
      milestone: { goal: { workspaceId: id } },
    },
    include: {
      milestone: {
        select: {
          id: true,
          title: true,
          goal: { select: { id: true, title: true } },
        },
      },
      sprint: { select: { id: true, name: true } },
    },
    orderBy: [
      { status: "asc" },
      { priority: "desc" },
      { dueDate: "asc" },
    ],
  });

  const grouped = {
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    in_review: tasks.filter((t) => t.status === "in_review"),
    todo: tasks.filter((t) => t.status === "todo"),
    done: tasks.filter((t) => t.status === "done"),
  };

  const activeCount = tasks.filter((t) => t.status !== "done").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <AppShell workspaceId={id} role={session.user.role}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink">My Tasks</h1>
            <p className="text-slate text-sm mt-1">
              All tasks assigned to you in this workspace
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="bg-blue-faint text-blue font-semibold px-3 py-1 rounded-full text-xs">
              {activeCount} active
            </span>
            <span className="bg-green-50 text-success font-semibold px-3 py-1 rounded-full text-xs">
              {doneCount} done
            </span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-border p-12 text-center">
            <ListTodo size={40} className="text-muted mx-auto mb-4" />
            <h3 className="font-semibold text-ink">No tasks assigned to you</h3>
            <p className="text-sm text-slate mt-1 mb-5">
              Tasks assigned to you from goals and milestones will appear here.
            </p>
            <Link
              href={`/workspace/${id}/board`}
              className="inline-flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
            >
              Go to board
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {(["in_progress", "blocked", "in_review", "todo", "done"] as const).map((status) => {
              const group = grouped[status];
              if (group.length === 0) return null;
              const meta = STATUS_META[status];

              return (
                <section key={status}>
                  <div className="flex items-center gap-2 mb-3">
                    {meta.icon}
                    <h2 className="text-sm font-semibold text-ink">{meta.label}</h2>
                    <span className="text-xs text-muted">({group.length})</span>
                  </div>

                  <div className="space-y-2">
                    {group.map((task) => {
                      const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
                      const isOverdue =
                        task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";

                      return (
                        <div
                          key={task.id}
                          className="bg-white rounded-2xl border border-border px-5 py-4 flex items-start gap-4 hover:border-blue/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <p
                                className={`text-sm font-medium leading-snug ${
                                  task.status === "done" ? "line-through text-muted" : "text-ink"
                                }`}
                              >
                                {task.title}
                              </p>
                              <div className={`flex items-center gap-1 text-xs shrink-0 ${pm.color}`}>
                                {pm.icon}
                                <span>{pm.label}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 mt-2.5 flex-wrap text-xs text-muted">
                              {/* Interactive status dropdown */}
                              <TaskStatusDropdown
                                taskId={task.id}
                                initialStatus={task.status as "todo" | "in_progress" | "in_review" | "blocked" | "done"}
                                milestoneId={task.milestone.id}
                                workspaceId={id}
                              />

                              <Link
                                href={`/workspace/${id}/goals/${task.milestone.goal.id}`}
                                className="flex items-center gap-1 hover:text-blue transition-colors"
                              >
                                <span className="truncate max-w-[140px]">{task.milestone.goal.title}</span>
                                <ChevronRight size={10} />
                                <span className="truncate max-w-[120px]">{task.milestone.title}</span>
                              </Link>

                              {task.sprint && (
                                <span className="bg-offwhite border border-border px-2 py-0.5 rounded-full">
                                  {task.sprint.name}
                                </span>
                              )}

                              {task.storyPoints != null && (
                                <span className="bg-offwhite border border-border px-2 py-0.5 rounded-full">
                                  {task.storyPoints} pts
                                </span>
                              )}

                              {task.dueDate && (
                                <span className={isOverdue ? "text-danger font-semibold" : ""}>
                                  {isOverdue ? "Overdue · " : "Due "}
                                  {new Date(task.dueDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
