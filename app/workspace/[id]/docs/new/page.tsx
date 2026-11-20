import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DocEditor } from "@/components/docs/DocEditorDynamic";
import { getSlimWorkspaceMembership } from "@/lib/workspace-data";

interface NewDocPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkedGoalId?: string; linkedMilestoneId?: string }>;
}

export default async function NewDocPage({ params, searchParams }: NewDocPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;
  const { linkedGoalId, linkedMilestoneId } = await searchParams;

  const [member, goals, milestones] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    prisma.goal.findMany({ where: { workspaceId: id }, select: { id: true, title: true } }),
    prisma.milestone.findMany({ where: { goal: { workspaceId: id } }, select: { id: true, title: true } }),
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
      }}
      goals={goals}
      milestones={milestones}
    />
  );
}
