import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { DocEditor } from "@/components/docs/DocEditorDynamic";

interface EditDocPageProps {
  params: Promise<{ id: string; docId: string }>;
}

export default async function EditDocPage({ params }: EditDocPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id, docId } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const [doc, goals, milestones] = await Promise.all([
    prisma.document.findUnique({ where: { id: docId } }),
    prisma.goal.findMany({ where: { workspaceId: id }, select: { id: true, title: true } }),
    prisma.milestone.findMany({ where: { goal: { workspaceId: id } }, select: { id: true, title: true } }),
  ]);

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
