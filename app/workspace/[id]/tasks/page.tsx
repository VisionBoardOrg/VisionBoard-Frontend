import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { TasksFilteredList, type MilestoneOption } from "@/components/tasks/TasksFilteredList";
import { getSlimWorkspaceMembership, getWorkspaceName } from "@/lib/workspace-data";

interface TasksPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ taskId?: string }>;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const TASK_LIMIT = 200;

export async function generateMetadata({ params }: TasksPageProps) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Tasks — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function TasksPage({ params, searchParams }: TasksPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const [{ id }, { taskId }] = await Promise.all([params, searchParams]);

  const [member, rawTasks, rawMilestones] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    prisma.task.findMany({
      where: { workspaceId: id },
      include: {
        assignees: { select: { userId: true, role: true } },
        milestone: {
          select: {
            id: true,
            title: true,
            goal: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: TASK_LIMIT,
    }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId: id } },
      select: {
        id: true,
        title: true,
        goalId: true,
        goal: { select: { title: true } },
      },
      orderBy: { order: "asc" },
      take: 100,
    }),
  ]);

  if (!member) redirect("/dashboard");

  // Sort explicitly by priority weight (urgent > high > medium > low) then earliest dueDate,
  // avoiding alphabetical Prisma enum sorting.
  const tasks = [...rawTasks].sort((a, b) => {
    const wDiff = (PRIORITY_WEIGHT[b.priority] ?? 2) - (PRIORITY_WEIGHT[a.priority] ?? 2);
    if (wDiff !== 0) return wDiff;
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return aDue - bDue;
  });

  const milestones: MilestoneOption[] = rawMilestones.map((m) => ({
    id: m.id,
    title: m.title,
    goalId: m.goalId,
    goalTitle: m.goal.title,
  }));

  const myTasks = tasks.filter((t) =>
    t.assignees.some((a) => a.userId === session.user.id)
  );
  const activeCount = myTasks.filter((t) => t.status !== "done").length;
  const doneCount = myTasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tasks</h1>
          <p className="text-slate text-sm mt-1">
            Track your assigned tasks or switch to all workspace tasks
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          <span className="bg-blue-faint text-blue font-semibold px-3 py-1 rounded-full text-xs">
            {activeCount} active
          </span>
          <span className="bg-green-50 text-success font-semibold px-3 py-1 rounded-full text-xs">
            {doneCount} done
          </span>
          <Link
            href={`/workspace/${id}/board`}
            className="inline-flex items-center gap-1.5 border border-border bg-white text-ink rounded-xl px-3 py-1.5 text-xs font-semibold hover:bg-offwhite transition-colors"
          >
            <LayoutGrid size={13} aria-hidden="true" />
            Open Board
          </Link>
        </div>
      </div>

      <TasksFilteredList
        tasks={tasks}
        workspaceId={id}
        currentUserId={session.user.id}
        milestones={milestones}
        highlightedTaskId={taskId ?? null}
        truncated={rawTasks.length >= TASK_LIMIT}
      />
    </div>
  );
}
