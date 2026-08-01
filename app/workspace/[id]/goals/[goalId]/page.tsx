import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { GoalDetail } from "@/components/goals/GoalDetail";

interface GoalPageProps { params: Promise<{ id: string; goalId: string }> }

export default async function GoalPage({ params }: GoalPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id, goalId } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      milestones: {
        include: { tasks: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
      documents: { include: { author: { select: { id: true, name: true } } } },
      comments: { include: { author: { select: { id: true, name: true, image: true } } }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!goal || goal.workspaceId !== id) redirect(`/workspace/${id}/board`);

  return (
    <AppShell workspaceId={id} role={session.user.role}>
      <GoalDetail goal={goal as never} workspaceId={id} userId={session.user.id} />
    </AppShell>
  );
}
