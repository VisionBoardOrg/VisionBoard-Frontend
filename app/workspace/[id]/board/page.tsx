import { cache } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BoardCanvas } from "@/components/board/BoardCanvas";

interface BoardPageProps {
  params: Promise<{ id: string }>;
}

/**
 * React.cache() deduplicates this query within a single request — both
 * generateMetadata and the page component call it, but Prisma only runs once.
 */
const getWorkspace = cache((id: string) =>
  prisma.workspace.findUnique({
    where: { id },
    select: { name: true, ownerId: true },
  })
);

export async function generateMetadata({ params }: BoardPageProps) {
  const { id } = await params;
  const workspace = await getWorkspace(id);
  return { title: `Board — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // Membership check, workspace data, and user plan run in parallel.
  const [memberCheck, workspace, currentUser] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    }),
    getWorkspace(id),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, aiCreditsUsed: true },
    }),
  ]);

  if (!memberCheck || !workspace || !currentUser) redirect("/dashboard");

  const [boardItems, goals, milestones, members] = await Promise.all([
    prisma.boardItem.findMany({
      where: { workspaceId: id },
      take: 500,
      include: {
        linkedGoal: {
          select: { id: true, title: true, status: true, healthScore: true, objective: true, targetDate: true },
        },
        linkedMilestone: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            targetDate: true,
            startDate: true,
            goalId: true,
          },
        },
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
            assigneeId: true,
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

  const now = new Date();
  const updatedMilestones = milestones.map((m) => {
    if (m.status === "planned" || m.status === "in_progress") {
      if (m.targetDate && new Date(m.targetDate) < now) {
        return { ...m, status: "delayed" as const };
      }
    }
    return m;
  });

  const goalMap = new Map(goals.map((g) => [g.id, g]));
  const milestoneMap = new Map(updatedMilestones.map((m) => [m.id, m]));
  const updatedBoardItems = boardItems.map((item) => {
    let linkedGoal = item.linkedGoal;
    if (linkedGoal) {
      const g = goalMap.get(linkedGoal.id);
      if (g) {
        linkedGoal = {
          ...linkedGoal,
          objective: g.objective,
          targetDate: g.targetDate,
          status: g.status,
          healthScore: g.healthScore,
        };
      }
    }

    let linkedMilestone = item.linkedMilestone as (Record<string, unknown> & { id: string; tasks?: unknown[] }) | null;
    if (linkedMilestone) {
      const ms = milestoneMap.get(linkedMilestone.id);
      if (ms) {
        linkedMilestone = {
          ...linkedMilestone,
          description: ms.description,
          targetDate: ms.targetDate,
          startDate: ms.startDate,
          status: ms.status,
          tasks: ms.tasks ?? [],
        };
      }
    }

    return {
      ...item,
      linkedGoal,
      linkedMilestone,
    };
  });

  return (
    <BoardCanvas
      workspaceId={id}
      initialItems={updatedBoardItems as never}
      goals={goals as never}
      milestones={updatedMilestones as never}
      members={members.map((m) => m.user)}
    />
  );
}
