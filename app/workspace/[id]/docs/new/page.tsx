import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { DocEditor } from "@/components/docs/DocEditor";

interface NewDocPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ linkedGoalId?: string; linkedMilestoneId?: string }>;
}

export default async function NewDocPage({ params, searchParams }: NewDocPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;
  const { linkedGoalId, linkedMilestoneId } = await searchParams;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const [goals, milestones] = await Promise.all([
    prisma.goal.findMany({ where: { workspaceId: id }, select: { id: true, title: true } }),
    prisma.milestone.findMany({ where: { goal: { workspaceId: id } }, select: { id: true, title: true } }),
  ]);

  return (
    <AppShell workspaceId={id} role={session.user.role}>
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
    </AppShell>
  );
}
