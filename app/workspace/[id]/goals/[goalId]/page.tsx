import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GoalDetail } from "@/components/goals/GoalDetail";
import { getSlimWorkspaceMembership, getWorkspaceName } from "@/lib/workspace-data";

interface GoalPageProps {
  params: Promise<{ id: string; goalId: string }>;
}

export async function generateMetadata({ params }: GoalPageProps) {
  const { id, goalId } = await params;
  const [workspace, goal] = await Promise.all([
    getWorkspaceName(id),
    prisma.goal.findUnique({
      where: { id: goalId },
      select: { title: true, workspaceId: true },
    }),
  ]);
  const title = goal && goal.workspaceId === id ? goal.title : "Goal";
  return { title: `${title} — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function GoalPage({ params }: GoalPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id, goalId } = await params;

  // getSlimWorkspaceMembership is deduplicated with WorkspaceLayout via React.cache().
  const [member, goal] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
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
  if (!goal || goal.workspaceId !== id) redirect(`/workspace/${id}/goals`);

  const canEdit = member.role === "admin" || member.role === "pm";

  return (
    <GoalDetail
      goal={goal as never}
      workspaceId={id}
      userId={session.user.id}
      canEdit={canEdit}
    />
  );
}
