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

  // Fetch membership + goal in parallel — avoids two sequential round trips.
  // We include a minimal workspace-check field on the goal so we can verify
  // it belongs to this workspace without a separate query.
  const [member, goal] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    }),
    prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        milestones: {
          include: { tasks: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
        // Only fetch document metadata on the detail page — the content JSONB
        // blob is only needed inside the editor, not in the goal detail sidebar.
        documents: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            linkedGoalId: true,
            linkedMilestoneId: true,
            linkedTaskId: true,
            author: { select: { id: true, name: true } },
          },
        },
        comments: {
          include: { author: { select: { id: true, name: true, image: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  if (!member) redirect("/dashboard");
  if (!goal || goal.workspaceId !== id) redirect(`/workspace/${id}/board`);

  return (
    <AppShell workspaceId={id} role={session.user.role}
      userId={session.user.id}
    >
      <GoalDetail goal={goal as never} workspaceId={id} userId={session.user.id} />
    </AppShell>
  );
}
