import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { generationId, goalId, milestones } = await request.json() as {
    generationId: string;
    goalId: string;
    milestones: { title: string; description: string; targetDate: string; suggestedTasks?: string[] }[];
  };

  if (!generationId || !goalId || !milestones?.length) {
    return NextResponse.json({ error: "generationId, goalId, and milestones required" }, { status: 400 });
  }

  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: goal.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const created = await prisma.$transaction(
    milestones.map((m, i) =>
      prisma.milestone.create({
        data: {
          goalId,
          title: m.title,
          description: m.description,
          targetDate: new Date(m.targetDate),
          order: i,
          tasks: {
            create: (m.suggestedTasks ?? []).map((t, ti) => ({
              title: t, order: ti, assigneeId: session.user.id,
            })),
          },
        },
      })
    )
  );

  // Auto-create a BoardItem for each committed milestone so they appear on the
  // board canvas immediately. Items are arranged in a horizontal row with spacing.
  const ITEM_W = 220;
  const ITEM_H = 130;
  const COL_GAP = 40;
  const ROW_START_X = 60;
  const ROW_START_Y = 60;

  // Check if the goal already has a board card; if not, create one too.
  const existingGoalItem = await prisma.boardItem.findFirst({
    where: { workspaceId: goal.workspaceId, linkedGoalId: goalId },
  });

  const boardItemsToCreate = [
    // Goal card (only if missing)
    ...(!existingGoalItem
      ? [{
          workspaceId: goal.workspaceId,
          entityType: "goal" as const,
          linkedGoalId: goalId,
          x: ROW_START_X,
          y: ROW_START_Y,
          width: ITEM_W,
          height: ITEM_H,
        }]
      : []),
    // One milestone card per created milestone, laid out in a row below the goal
    ...created.map((m, i) => ({
      workspaceId: goal.workspaceId,
      entityType: "milestone" as const,
      linkedMilestoneId: m.id,
      x: ROW_START_X + i * (ITEM_W + COL_GAP),
      y: ROW_START_Y + ITEM_H + COL_GAP,
      width: ITEM_W,
      height: ITEM_H,
    })),
  ];

  if (boardItemsToCreate.length > 0) {
    await prisma.boardItem.createMany({ data: boardItemsToCreate });
  }

  await prisma.aIGenerationLog.update({
    where: { id: generationId },
    data: { accepted: true, entityCreated: JSON.stringify({ type: "milestones", ids: created.map((m) => m.id) }) },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: goal.workspaceId, userId: session.user.id,
      entityType: "goal", entityId: goalId, action: "ai_roadmap_applied",
      diff: { milestonesCreated: created.length } as never,
    },
  });

  return NextResponse.json({ milestones: created });
}
