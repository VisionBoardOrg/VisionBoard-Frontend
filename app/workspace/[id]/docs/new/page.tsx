import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocEditor } from "@/components/docs/DocEditorDynamic";
import { getSlimWorkspaceMembership } from "@/lib/workspace-data";

interface NewDocPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkedGoalId?: string; linkedMilestoneId?: string; linkedTaskId?: string }>;
}

export default async function NewDocPage({ params, searchParams }: NewDocPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const [{ id }, { linkedGoalId, linkedMilestoneId, linkedTaskId }] = await Promise.all([
    params,
    searchParams,
  ]);

  const [member, goals, milestones, tasks] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
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

  return (
    <DocEditor
      workspaceId={id}
      initialData={{
        title: "",
        content: "",
        linkedGoalId: linkedGoalId ?? null,
        linkedMilestoneId: linkedMilestoneId ?? null,
        linkedTaskId: linkedTaskId ?? null,
      }}
      goals={goals}
      milestones={milestones.map((m) => ({
        id: m.id,
        title: m.title,
        goalTitle: m.goal?.title ?? null,
      }))}
      tasks={tasks}
    />
  );
}
