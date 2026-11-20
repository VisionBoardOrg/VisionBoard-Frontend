import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BoardCanvas } from "@/components/board/BoardCanvas";
import {
  getSlimWorkspaceMembership,
  getUserPlanAndCredits,
  getWorkspaceName,
} from "@/lib/workspace-data";

interface BoardPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BoardPageProps) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Board — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // getSlimWorkspaceMembership and getUserPlanAndCredits are already populated
  // by WorkspaceLayout (React.cache within request → 0 extra DB round-trips),
  // and run in parallel with all board data fetches (single wave, no waterfall).
  const [memberCheck, currentUser, boardItems, goals, milestones, members] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    getUserPlanAndCredits(session.user.id),
    prisma.boardItem.findMany({
      where: { workspaceId: id },
      take: 500,
      // Select only scalar card fields — linkedGoal and linkedMilestone are
      // hydrated on the client from `goals` and `milestones` below so we don't
      // serialize every goal, milestone, and task array twice in the RSC stream.
      select: {
        id: true,
        workspaceId: true,
        x: true,
        y: true,
        width: true,
        height: true,
        entityType: true,
        color: true,
        label: true,
        linkedGoalId: true,
        linkedMilestoneId: true,
        linkedTaskId: true,
      },
    }),
    prisma.goal.findMany({
      where: { workspaceId: id },
      select: {
        id: true,
        title: true,
        objective: true,
        status: true,
        healthScore: true,
        targetDate: true,
        keyResults: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId: id } },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        targetDate: true,
        startDate: true,
        dependsOn: true,
        order: true,
        goalId: true,
        tasks: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            storyPoints: true,
            assignees: { select: { userId: true, role: true } },
            dueDate: true,
          },
        },
      },
      orderBy: { order: "asc" },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    }),
  ]);

  if (!memberCheck || !currentUser) redirect("/dashboard");

  const now = new Date();
  const updatedMilestones = milestones.map((m) => {
    if (m.status === "planned" || m.status === "in_progress") {
      if (m.targetDate && new Date(m.targetDate) < now) {
        return { ...m, status: "delayed" as const };
      }
    }
    return m;
  });

  return (
    <BoardCanvas
      workspaceId={id}
      initialItems={boardItems as never}
      goals={goals as never}
      milestones={updatedMilestones as never}
      members={members.map((m) => m.user)}
    />
  );
}
