import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ListTodo } from "lucide-react";
import { TasksFilteredList } from "@/components/tasks/TasksFilteredList";

interface TasksPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TasksPageProps) {
  // Next.js calls generateMetadata concurrently with the page component, so
  // this does not add an extra sequential round trip in practice.
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: `My Tasks — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function TasksPage({ params }: TasksPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  // Run member check + task fetch in parallel
  const [member, tasks] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    }),
    prisma.task.findMany({
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

      },
      orderBy: [
        { status: "asc" },
        { priority: "desc" },
        { dueDate: "asc" },
      ],
      take: 200,
    }),
  ]);

  if (!member) redirect("/dashboard");
  const activeCount = tasks.filter((t) => t.status !== "done").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
        <TasksFilteredList tasks={tasks} workspaceId={id} />
      )}
    </div>
  );
}
