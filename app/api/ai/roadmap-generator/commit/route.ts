import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    generationId: string;
    goalId?: string | null;
    newGoal?: {
      title: string;
      objective?: string;
      targetDate?: string | null;
      status?: "draft" | "active";
    } | null;
    milestones: { title: string; description: string; targetDate: string; suggestedTasks?: string[] }[];
  };

  const { generationId, goalId, newGoal, milestones } = body;

  const isCreatingNewGoal = !goalId || goalId === "new" || Boolean(newGoal?.title);

  if (!generationId || !milestones?.length) {
    return NextResponse.json({ error: "generationId and milestones are required" }, { status: 400 });
  }

  if (isCreatingNewGoal && !newGoal?.title?.trim()) {
    return NextResponse.json({ error: "A goal title is required when creating a new goal" }, { status: 400 });
  }

  const aiLog = await prisma.aIGenerationLog.findUnique({
    where: { id: generationId },
  });
  if (!aiLog || aiLog.userId !== session.user.id) {
    return NextResponse.json({ error: "Invalid or unauthorized AI generation log" }, { status: 400 });
  }

  const workspaceId = aiLog.workspaceId;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let targetGoalId: string;
  let committedGoal: { id: string; title: string; objective: string; status: string; targetDate: Date | null };

  if (isCreatingNewGoal && newGoal?.title?.trim()) {
    const goalTitle = newGoal.title.trim();
    const goalObjective = newGoal.objective?.trim() || "Generated from AI Roadmap Synthesizer";
    
    // Parse target date from newGoal or last milestone
    let finalTargetDate: Date | null = null;
    if (newGoal.targetDate) {
      const parsed = new Date(newGoal.targetDate);
      if (!isNaN(parsed.getTime())) finalTargetDate = parsed;
    } else if (milestones.length > 0) {
      const lastDate = new Date(milestones[milestones.length - 1].targetDate);
      if (!isNaN(lastDate.getTime())) finalTargetDate = lastDate;
    }

    const createdGoal = await prisma.goal.create({
      data: {
        workspaceId,
        title: goalTitle,
        objective: goalObjective,
        targetDate: finalTargetDate,
        status: newGoal.status === "draft" ? "draft" : "active",
        ownerId: session.user.id,
      },
    });

    targetGoalId = createdGoal.id;
    committedGoal = createdGoal;
  } else {
    if (!goalId) {
      return NextResponse.json({ error: "Goal ID is required" }, { status: 400 });
    }
    const existingGoal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!existingGoal || existingGoal.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Goal not found in this workspace" }, { status: 404 });
    }
    targetGoalId = existingGoal.id;
    committedGoal = existingGoal;
  }

  const created = await prisma.$transaction(
    milestones.map((m, i) => {
      const targetDate = m.targetDate ? new Date(m.targetDate) : null;
      const validTargetDate = targetDate && !isNaN(targetDate.getTime()) ? targetDate : null;

      return prisma.milestone.create({
        data: {
          goalId: targetGoalId,
          title: m.title,
          description: m.description,
          targetDate: validTargetDate,
          order: i,
          tasks: {
            create: (m.suggestedTasks ?? []).map((t, ti) => ({
              title: t,
              order: ti,
              dueDate: validTargetDate ?? new Date(Date.now() + (ti + 1) * 2 * 24 * 60 * 60 * 1000),
              assigneeId: session.user.id,
            })),
          },
        },
      });
    })
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
    where: { workspaceId, linkedGoalId: targetGoalId },
  });

  const boardItemsToCreate = [
    // Goal card (only if missing)
    ...(!existingGoalItem
      ? [
          {
            workspaceId,
            entityType: "goal" as const,
            linkedGoalId: targetGoalId,
            x: ROW_START_X,
            y: ROW_START_Y,
            width: ITEM_W,
            height: ITEM_H,
          },
        ]
      : []),
    // One milestone card per created milestone, laid out in a row below the goal
    ...created.map((m, i) => ({
      workspaceId,
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
    data: {
      accepted: true,
      entityCreated: JSON.stringify({
        type: "milestones",
        goalId: targetGoalId,
        ids: created.map((m) => m.id),
      }),
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "goal",
      entityId: targetGoalId,
      action: "ai_roadmap_applied",
      diff: {
        milestonesCreated: created.length,
        isNewGoal: isCreatingNewGoal,
      } as never,
    },
  });

  return NextResponse.json({ goal: committedGoal, milestones: created });
}

