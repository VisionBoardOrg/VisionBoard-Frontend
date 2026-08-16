import { prisma } from "@/lib/prisma";

export type GoalHealthStatus = "on_track" | "needs_attention" | "at_risk";

export interface GoalHealthEvaluation {
  goalId: string;
  goalTitle: string;
  workspaceId: string;
  previousScore: number;
  healthScore: number;
  status: GoalHealthStatus;
  degraded: boolean;
  metrics: {
    totalMilestones: number;
    completedMilestones: number;
    delayedMilestones: number;
    totalTasks: number;
    doneTasks: number;
    blockedTasks: number;
    overdueTasks: number;
  };
}

/**
 * Calculates and persists the dynamic health score (0–100) for a given Goal.
 * Evaluates task completion, blocked items, overdue dates, and delayed milestones.
 */
export async function calculateGoalHealth(goalId: string): Promise<GoalHealthEvaluation | null> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      milestones: {
        include: {
          tasks: {
            select: {
              id: true,
              status: true,
              dueDate: true,
              priority: true,
            },
          },
        },
      },
    },
  });

  if (!goal) return null;

  const now = new Date();
  const milestones = goal.milestones;
  const allTasks = milestones.flatMap((m) => m.tasks);

  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === "completed").length;

  // Auto-detect delayed milestones based on targetDate or explicit status
  const delayedMilestoneIds: string[] = [];
  for (const m of milestones) {
    if (m.status !== "completed" && m.targetDate && new Date(m.targetDate) < now) {
      delayedMilestoneIds.push(m.id);
    }
  }

  // Update delayed milestones in database if they weren't already marked delayed
  if (delayedMilestoneIds.length > 0) {
    await prisma.milestone.updateMany({
      where: {
        id: { in: delayedMilestoneIds },
        status: { not: "delayed" },
      },
      data: { status: "delayed" },
    }).catch((err) => console.error("[goal-health] Auto milestone delay update error:", err));
  }

  const delayedMilestones = milestones.filter(
    (m) => m.status === "delayed" || (m.status !== "completed" && m.targetDate && new Date(m.targetDate) < now)
  ).length;

  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const blockedTasks = allTasks.filter((t) => t.status === "blocked").length;
  const overdueTasks = allTasks.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < now
  ).length;

  let computedScore = 100;

  if (totalTasks === 0 && totalMilestones === 0) {
    computedScore = goal.status === "completed" ? 100 : goal.status === "cancelled" ? 0 : 70;
  } else {
    // 1. Completion baseline (up to 100 points)
    const taskRatio = totalTasks > 0 ? doneTasks / totalTasks : 1;
    const milestoneRatio = totalMilestones > 0 ? completedMilestones / totalMilestones : 1;

    let baseProgressScore = Math.round((taskRatio * 50) + (milestoneRatio * 50));

    // If no progress has been made yet, start at a baseline of 75 instead of 0
    if (baseProgressScore === 0 && totalTasks > 0) {
      baseProgressScore = 75;
    } else if (baseProgressScore > 0) {
      // Scale up base progress so early-stage goals aren't automatically scored 0
      baseProgressScore = Math.max(60, baseProgressScore);
    }

    // 2. Apply penalties for risks and bottlenecks
    const blockedPenalty = Math.min(45, blockedTasks * 15);
    const overduePenalty = Math.min(30, overdueTasks * 10);
    const delayedMilestonePenalty = Math.min(40, delayedMilestones * 20);

    // 3. Goal deadline penalty
    let goalDeadlinePenalty = 0;
    if (goal.targetDate && new Date(goal.targetDate) < now && (totalTasks > doneTasks || totalMilestones > completedMilestones)) {
      goalDeadlinePenalty = 25;
    }

    computedScore = baseProgressScore - blockedPenalty - overduePenalty - delayedMilestonePenalty - goalDeadlinePenalty;

    // If all tasks and milestones are done, force 100
    if (totalTasks > 0 && doneTasks === totalTasks && totalMilestones === completedMilestones) {
      computedScore = 100;
    }
  }

  // Clamp score between 0 and 100
  const finalScore = Math.max(0, Math.min(100, Math.round(computedScore)));

  const previousScore = goal.healthScore;
  const degraded = finalScore < previousScore && finalScore < 70;

  let healthStatus: GoalHealthStatus = "on_track";
  if (finalScore < 40) {
    healthStatus = "at_risk";
  } else if (finalScore < 70) {
    healthStatus = "needs_attention";
  }

  // Update Goal healthScore if changed
  if (finalScore !== previousScore) {
    await prisma.goal.update({
      where: { id: goalId },
      data: { healthScore: finalScore },
    });

    // Record activity log if score degraded significantly
    if (Math.abs(finalScore - previousScore) >= 10 || degraded) {
      await prisma.activityLog.create({
        data: {
          workspaceId: goal.workspaceId,
          userId: goal.ownerId ?? null,
          entityType: "goal",
          entityId: goalId,
          action: "health_score_updated",
          diff: {
            previousScore,
            newScore: finalScore,
            healthStatus,
            blockedTasks,
            overdueTasks,
            delayedMilestones,
          },
        },
      }).catch((err) => console.error("[goal-health] Activity log write error:", err));
    }
  }

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    workspaceId: goal.workspaceId,
    previousScore,
    healthScore: finalScore,
    status: healthStatus,
    degraded,
    metrics: {
      totalMilestones,
      completedMilestones,
      delayedMilestones,
      totalTasks,
      doneTasks,
      blockedTasks,
      overdueTasks,
    },
  };
}

/**
 * Re-evaluates health scores for all active goals across all or a specific workspace.
 * Highly optimized batch implementation: fetches all goals in 1 query, computes in-memory,
 * and bulk updates in batch transactions.
 */
export async function evaluateAllGoalsHealth(workspaceId?: string): Promise<GoalHealthEvaluation[]> {
  const goals = await prisma.goal.findMany({
    where: {
      status: { in: ["active", "draft"] },
      ...(workspaceId ? { workspaceId } : {}),
    },
    include: {
      milestones: {
        include: {
          tasks: {
            select: {
              id: true,
              status: true,
              dueDate: true,
              priority: true,
            },
          },
        },
      },
    },
  });

  if (goals.length === 0) return [];

  const now = new Date();
  const evaluations: GoalHealthEvaluation[] = [];
  const delayedMilestoneIds: string[] = [];
  const goalsToUpdate: Array<{
    id: string;
    healthScore: number;
    workspaceId: string;
    ownerId: string | null;
    previousScore: number;
    degraded: boolean;
    healthStatus: GoalHealthStatus;
  }> = [];

  for (const goal of goals) {
    const milestones = goal.milestones;
    const allTasks = milestones.flatMap((m) => m.tasks);

    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m) => m.status === "completed").length;

    for (const m of milestones) {
      if (m.status !== "completed" && m.targetDate && new Date(m.targetDate) < now && m.status !== "delayed") {
        delayedMilestoneIds.push(m.id);
      }
    }

    const delayedMilestones = milestones.filter(
      (m) => m.status === "delayed" || (m.status !== "completed" && m.targetDate && new Date(m.targetDate) < now)
    ).length;

    const totalTasks = allTasks.length;
    const doneTasks = allTasks.filter((t) => t.status === "done").length;
    const blockedTasks = allTasks.filter((t) => t.status === "blocked").length;
    const overdueTasks = allTasks.filter(
      (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < now
    ).length;

    let computedScore = 100;
    if (totalTasks === 0 && totalMilestones === 0) {
      computedScore = goal.status === "completed" ? 100 : goal.status === "cancelled" ? 0 : 70;
    } else {
      const taskRatio = totalTasks > 0 ? doneTasks / totalTasks : 1;
      const milestoneRatio = totalMilestones > 0 ? completedMilestones / totalMilestones : 1;
      let baseProgressScore = Math.round(taskRatio * 50 + milestoneRatio * 50);

      if (baseProgressScore === 0 && totalTasks > 0) {
        baseProgressScore = 75;
      } else if (baseProgressScore > 0) {
        baseProgressScore = Math.max(60, baseProgressScore);
      }

      const blockedPenalty = Math.min(45, blockedTasks * 15);
      const overduePenalty = Math.min(30, overdueTasks * 10);
      const delayedMilestonePenalty = Math.min(40, delayedMilestones * 20);

      let goalDeadlinePenalty = 0;
      if (
        goal.targetDate &&
        new Date(goal.targetDate) < now &&
        (totalTasks > doneTasks || totalMilestones > completedMilestones)
      ) {
        goalDeadlinePenalty = 25;
      }

      computedScore =
        baseProgressScore - blockedPenalty - overduePenalty - delayedMilestonePenalty - goalDeadlinePenalty;
      if (totalTasks > 0 && doneTasks === totalTasks && totalMilestones === completedMilestones) {
        computedScore = 100;
      }
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(computedScore)));
    const previousScore = goal.healthScore;
    const degraded = finalScore < previousScore && finalScore < 70;

    let healthStatus: GoalHealthStatus = "on_track";
    if (finalScore < 40) {
      healthStatus = "at_risk";
    } else if (finalScore < 70) {
      healthStatus = "needs_attention";
    }

    const evaluation: GoalHealthEvaluation = {
      goalId: goal.id,
      goalTitle: goal.title,
      workspaceId: goal.workspaceId,
      previousScore,
      healthScore: finalScore,
      status: healthStatus,
      degraded,
      metrics: {
        totalMilestones,
        completedMilestones,
        delayedMilestones,
        totalTasks,
        doneTasks,
        blockedTasks,
        overdueTasks,
      },
    };
    evaluations.push(evaluation);

    if (finalScore !== previousScore) {
      goalsToUpdate.push({
        id: goal.id,
        healthScore: finalScore,
        workspaceId: goal.workspaceId,
        ownerId: goal.ownerId,
        previousScore,
        degraded,
        healthStatus,
      });
    }
  }

  // 1. Batch update slipping milestones if any
  if (delayedMilestoneIds.length > 0) {
    await prisma.milestone
      .updateMany({
        where: { id: { in: delayedMilestoneIds }, status: { not: "delayed" } },
        data: { status: "delayed" },
      })
      .catch((err) => console.error("[goal-health] Batch delayed milestones update error:", err));
  }

  // 2. Batch update goal scores in chunks of 50
  if (goalsToUpdate.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < goalsToUpdate.length; i += CHUNK_SIZE) {
      const chunk = goalsToUpdate.slice(i, i + CHUNK_SIZE);
      await prisma
        .$transaction(
          chunk.map((g) =>
            prisma.goal.update({
              where: { id: g.id },
              data: { healthScore: g.healthScore },
            })
          )
        )
        .catch((err) => console.error("[goal-health] Batch goal health update error:", err));
    }
  }

  return evaluations;
}
