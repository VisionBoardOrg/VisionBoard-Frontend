import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocEditor } from "@/components/docs/DocEditorDynamic";
import { getSlimWorkspaceMembership } from "@/lib/workspace-data";

interface EditDocPageProps {
  params: Promise<{ id: string; docId: string }>;
}

export default async function EditDocPage({ params }: EditDocPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id, docId } = await params;

  const [member, doc, goals, milestones, tasks] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    prisma.document.findUnique({ where: { id: docId } }),
    prisma.goal.findMany({ where: { workspaceId: id }, select: { id: true, title: true } }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId: id } },
      select: { id: true, title: true, goal: { select: { title: true } } },
    }),
    prisma.task.findMany({
      where: { workspaceId: id },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  if (!member) redirect("/dashboard");
  if (!doc || doc.workspaceId !== id) redirect(`/workspace/${id}/docs`);

  // Ensure a linked task outside the most recent 200 is still selectable and never dropped
  let taskOptions = tasks;
  if (doc.linkedTaskId && !tasks.some((t) => t.id === doc.linkedTaskId)) {
    const linkedTask = await prisma.task.findUnique({
      where: { id: doc.linkedTaskId },
      select: { id: true, title: true },
    });
    if (linkedTask) {
      taskOptions = [linkedTask, ...tasks];
    }
  }

  return (
    <DocEditor
      workspaceId={id}
      initialData={{
        id: doc.id,
        title: doc.title,
        content: doc.content,
        linkedGoalId: doc.linkedGoalId,
        linkedMilestoneId: doc.linkedMilestoneId,
        linkedTaskId: doc.linkedTaskId,
      }}
      goals={goals}
      milestones={milestones.map((m) => ({
        id: m.id,
        title: m.title,
        goalTitle: m.goal?.title ?? null,
      }))}
      tasks={taskOptions}
    />
  );
}
