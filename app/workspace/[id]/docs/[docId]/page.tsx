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

  const [member, doc, goals, milestones] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    prisma.document.findUnique({ where: { id: docId } }),
    prisma.goal.findMany({ where: { workspaceId: id }, select: { id: true, title: true } }),
    prisma.milestone.findMany({ where: { goal: { workspaceId: id } }, select: { id: true, title: true } }),
  ]);

  if (!member) redirect("/dashboard");
  if (!doc || doc.workspaceId !== id) redirect(`/workspace/${id}/docs`);

  return (
    <DocEditor
      workspaceId={id}
      initialData={{
        id: doc.id,
        title: doc.title,
        content: doc.content,
        linkedGoalId: doc.linkedGoalId,
        linkedMilestoneId: doc.linkedMilestoneId,
      }}
      goals={goals}
      milestones={milestones}
    />
  );
}
