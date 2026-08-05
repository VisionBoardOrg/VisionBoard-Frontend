import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ITEM_W = 220;
const ITEM_H = 130;
const COL_GOAL_X = 80;
const COL_MILESTONE_X = 380;
const ROW_GAP = 160;
const ROW_START_Y = 80;

/**
 * POST /api/board-items/sync
 * Creates BoardItem rows for any goals or milestones in the workspace that
 * don't have one yet. Safe to call multiple times — idempotent.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId } = await request.json() as { workspaceId: string };
  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch all goals + milestones in the workspace
  const [goals, milestones, existingItems] = await Promise.all([
    prisma.goal.findMany({ where: { workspaceId }, select: { id: true } }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId } },
      select: { id: true, goalId: true },
    }),
    prisma.boardItem.findMany({
      where: { workspaceId },
      select: { linkedGoalId: true, linkedMilestoneId: true, y: true, entityType: true },
    }),
  ]);

  const coveredGoalIds = new Set(
    existingItems.filter((i) => i.linkedGoalId).map((i) => i.linkedGoalId!)
  );
  const coveredMilestoneIds = new Set(
    existingItems.filter((i) => i.linkedMilestoneId).map((i) => i.linkedMilestoneId!)
  );

  const missingGoals = goals.filter((g) => !coveredGoalIds.has(g.id));
  const missingMilestones = milestones.filter((m) => !coveredMilestoneIds.has(m.id));

  if (missingGoals.length === 0 && missingMilestones.length === 0) {
    return NextResponse.json({ created: 0, message: "All entities already have board cards." });
  }

  // Find the lowest occupied Y in each column to place new cards below existing ones
  function nextY(colX: number): number {
    const colItems = existingItems.filter((i) => {
      if (colX === COL_GOAL_X) return i.entityType === "goal";
      return i.entityType === "milestone";
    });
    if (colItems.length === 0) return ROW_START_Y;
    const maxY = Math.max(...colItems.map((i) => i.y));
    return maxY + ITEM_H + ROW_GAP;
  }

  let goalY = nextY(COL_GOAL_X);
  let msY = nextY(COL_MILESTONE_X);

  const toCreate = [
    ...missingGoals.map((g) => {
      const item = {
        workspaceId,
        entityType: "goal" as const,
        linkedGoalId: g.id,
        x: COL_GOAL_X,
        y: goalY,
        width: ITEM_W,
        height: ITEM_H,
      };
      goalY += ITEM_H + ROW_GAP;
      return item;
    }),
    ...missingMilestones.map((m) => {
      const item = {
        workspaceId,
        entityType: "milestone" as const,
        linkedMilestoneId: m.id,
        linkedGoalId: m.goalId,
        x: COL_MILESTONE_X,
        y: msY,
        width: ITEM_W,
        height: ITEM_H,
      };
      msY += ITEM_H + ROW_GAP;
      return item;
    }),
  ];

  await prisma.boardItem.createMany({ data: toCreate });

  // Return newly created items so the client can add them to the canvas state
  const created = await prisma.boardItem.findMany({
    where: {
      workspaceId,
      OR: [
        { linkedGoalId: { in: missingGoals.map((g) => g.id) } },
        { linkedMilestoneId: { in: missingMilestones.map((m) => m.id) } },
      ],
    },
    include: {
      linkedGoal: { select: { id: true, title: true, status: true, healthScore: true } },
      linkedMilestone: {
        select: {
          id: true, title: true, status: true, goalId: true,
          tasks: { select: { id: true, title: true, status: true, priority: true, assigneeId: true } },
        },
      },
    },
  });

  return NextResponse.json({ created: created.length, items: created });
}
