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
    milestones: {
      title: string;
      description?: string;
      targetDate?: string;
      suggestedTasks?: unknown[];
      tasks?: unknown[];
      suggested_tasks?: unknown[];
    }[];
    resume?: boolean;
  };

  const { generationId, goalId, newGoal, milestones, resume } = body;

  const isCreatingNewGoal = !goalId || goalId === "new" || Boolean(newGoal?.title);

  if (!generationId || !milestones?.length) {
    return NextResponse.json({ error: "generationId and milestones are required" }, { status: 400 });
  }

  if (isCreatingNewGoal && !newGoal?.title?.trim() && !resume) {
    return NextResponse.json({ error: "A goal title is required when creating a new goal" }, { status: 400 });
  }

  const aiLog = await prisma.aIGenerationLog.findUnique({
    where: { id: generationId },
  });
  if (!aiLog || aiLog.userId !== session.user.id) {
    return NextResponse.json({ error: "Invalid or unauthorized AI generation log" }, { status: 400 });
  }

  type EntityCreatedData = {
    type: string;
    goalId: string;
    ids: string[];
    appliedMilestoneIndices?: number[];
  };
  const parsedEntityCreated: EntityCreatedData | null = aiLog.entityCreated
    ? (JSON.parse(aiLog.entityCreated) as EntityCreatedData)
    : null;
  const previouslyAppliedIndices = new Set<number>(parsedEntityCreated?.appliedMilestoneIndices ?? []);

  if (aiLog.accepted && !resume) {
    return NextResponse.json(
      {
        error: "This AI roadmap has already been applied to the board",
        resumable: true,
        existingGoalId: parsedEntityCreated?.goalId ?? null,
        appliedCount: previouslyAppliedIndices.size,
        totalMilestones: milestones.length,
      },
      { status: 409 }
    );
  }

  const workspaceId = aiLog.workspaceId;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let targetGoalId: string;
  let committedGoal: { id: string; title: string; objective: string; status: string; targetDate: Date | null };

  if (resume && parsedEntityCreated?.goalId) {
    const resumedGoal = await prisma.goal.findUnique({
      where: { id: parsedEntityCreated.goalId },
    });
    if (!resumedGoal || resumedGoal.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: "The previously used goal no longer exists in this workspace" },
        { status: 404 }
      );
    }
    targetGoalId = resumedGoal.id;
    committedGoal = resumedGoal;
  } else if (isCreatingNewGoal && newGoal?.title?.trim()) {
    const goalTitle = newGoal.title.trim();
    const goalObjective = newGoal.objective?.trim() || "Generated from AI Roadmap Synthesizer";

    let finalTargetDate: Date | null = null;
    if (newGoal.targetDate) {
      const parsed = new Date(newGoal.targetDate);
      if (!isNaN(parsed.getTime())) finalTargetDate = parsed;
    } else if (milestones.length > 0) {
      const lastMsDate = milestones[milestones.length - 1].targetDate;
      if (lastMsDate) {
        const lastDate = new Date(lastMsDate);
        if (!isNaN(lastDate.getTime())) finalTargetDate = lastDate;
      }
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

  type MilestoneWithIndex = {
    milestone: (typeof milestones)[number];
    originalIndex: number;
  };
  const milestonesToCreate: MilestoneWithIndex[] = milestones
    .map((m, originalIndex) => ({ milestone: m, originalIndex }))
    .filter(({ originalIndex }) => !previouslyAppliedIndices.has(originalIndex));

  if (milestonesToCreate.length === 0) {
    return NextResponse.json(
      {
        error: "All milestones in this roadmap have already been applied.",
        goal: committedGoal,
        milestones: [],
        skippedAll: true,
      },
      { status: 409 }
    );
  }

  const existingMilestoneCount = await prisma.milestone.count({
    where: { goalId: targetGoalId },
  });

  const created = await prisma.$transaction(
    milestonesToCreate.map(({ milestone: m, originalIndex }, relativeIndex) => {
      const targetDate = m.targetDate ? new Date(m.targetDate) : null;
      const validTargetDate = targetDate && !isNaN(targetDate.getTime()) ? targetDate : null;

      const rawTasks = (m.suggestedTasks ?? m.tasks ?? m.suggested_tasks ?? []) as unknown[];
      const taskTitles: string[] = rawTasks
        .map((t) => {
          if (typeof t === "string") return t.trim();
          if (t && typeof t === "object") {
            const obj = t as Record<string, unknown>;
            const val = obj.title ?? obj.name ?? obj.task ?? obj.description;
            if (typeof val === "string") return val.trim();
          }
          return "";
        })
        .filter(Boolean);

      return prisma.milestone.create({
        data: {
          goalId: targetGoalId,
          title: m.title,
          description: m.description || "",
          targetDate: validTargetDate,
          order: existingMilestoneCount + relativeIndex,
          tasks: {
            create: taskTitles.map((t, ti) => ({
              title: t,
              order: ti,
              workspaceId,
              dueDate:
                validTargetDate ??
                new Date(Date.now() + (ti + 1) * 2 * 24 * 60 * 60 * 1000),
              assigneeId: session.user.id,
            })),
          },
        },
      });
    })
  );

  const ITEM_W = 220;
  const ITEM_H = 130;
  const COL_GAP = 40;
  const ROW_START_X = 60;
  const ROW_START_Y = 60;

  const existingGoalItem = await prisma.boardItem.findFirst({
    where: { workspaceId, linkedGoalId: targetGoalId },
  });

  const existingMilestoneBoardItemsCount = resume
    ? existingMilestoneCount
    : 0;

  const boardItemsToCreate = [
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
    ...created.map((m, i) => ({
      workspaceId,
      entityType: "milestone" as const,
      linkedMilestoneId: m.id,
      x: ROW_START_X + (existingMilestoneBoardItemsCount + i) * (ITEM_W + COL_GAP),
      y: ROW_START_Y + ITEM_H + COL_GAP,
      width: ITEM_W,
      height: ITEM_H,
    })),
  ];

  if (boardItemsToCreate.length > 0) {
    await prisma.boardItem.createMany({ data: boardItemsToCreate });
  }

  const newlyAppliedIndices = milestonesToCreate.map(({ originalIndex }) => originalIndex);
  const mergedAppliedIndices = Array.from(
    new Set([...Array.from(previouslyAppliedIndices), ...newlyAppliedIndices])
  );
  const allMilestoneIds = [
    ...(parsedEntityCreated?.ids ?? []),
    ...created.map((m) => m.id),
  ];

  await prisma.aIGenerationLog.update({
    where: { id: generationId },
    data: {
      accepted: true,
      entityCreated: JSON.stringify({
        type: "milestones",
        goalId: targetGoalId,
        ids: allMilestoneIds,
        appliedMilestoneIndices: mergedAppliedIndices,
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
        isNewGoal: !resume && isCreatingNewGoal,
        resumed: Boolean(resume),
      } as never,
    },
  });

  return NextResponse.json({
    goal: committedGoal,
    milestones: created,
    resumed: Boolean(resume),
    appliedIndices: newlyAppliedIndices,
  });
}

