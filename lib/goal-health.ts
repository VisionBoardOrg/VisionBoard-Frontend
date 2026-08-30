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

// ── Types for the shared scoring engine ───────────────────────────────────

interface ScoringMilestone {
  id: string;
  status: string;
  targetDate?: Date | string | null;
}

interface ScoringTask {
  id: string;
  status: string;
  dueDate?: Date | string | null;
}

interface ScoringGoal {
  status: string;
  targetDate?: Date | string | null;
  healthScore: number;
}

interface ScoringResult {
  finalScore: number;
  status: GoalHealthStatus;
  degraded: boolean;
  metrics: GoalHealthEvaluation["metrics"];
  /** Milestone ids that were not already marked "delayed" but have elapsed. */
  newlyDelayedMilestoneIds: string[];
}

// ── F-10: single shared scoring function ──────────────────────────────────

/**
 * Pure in-memory health score computation for a goal.
 * Both `calculateGoalHealth` (single-goal API path) and
 * `evaluateWorkspaceGoalsHealth` (bulk cron path) call this so the algorithm
 * is defined exactly once — changes propagate to both callers automatically.
 *
 * No database access. All DB work is done by the callers.
 */
export function computeHealthScore(
  goal: ScoringGoal,
  milestones: ScoringMilestone[],
  tasks: ScoringTask[],
  now: Date
): ScoringResult {
  const totalMilestones    = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === "completed").length;

  const newlyDelayedMilestoneIds: string[] = [];
  for (const m of milestones) {
    if (
      m.status !== "completed" &&
      m.status !== "delayed" &&
      m.targetDate &&
      new Date(m.targetDate) < now
    ) {
      newlyDelayedMilestoneIds.push(m.id);
    }
  }

  const delayedMilestones = milestones.filter(
    (m) =>
      m.status === "delayed" ||
      (m.status !== "completed" && m.targetDate && new Date(m.targetDate) < now)
  ).length;

  const totalTasks   = tasks.length;
  const doneTasks    = tasks.filter((t) => t.status === "done").length;
  const blockedTasks = tasks.filter((t) => t.status === "blocked").length;
  const overdueTasks = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < now
  ).length;

  let computedScore = 100;

  if (totalTasks === 0 && totalMilestones === 0) {
    computedScore =
      goal.status === "completed" ? 100 :
      goal.status === "cancelled" ? 0   : 70;
  } else {
    const taskRatio      = totalTasks > 0      ? doneTasks / totalTasks              : 1;
    const milestoneRatio = totalMilestones > 0 ? completedMilestones / totalMilestones : 1;

    let baseProgressScore = Math.round(taskRatio * 50 + milestoneRatio * 50);

    if (baseProgressScore === 0 && totalTasks > 0) {
      baseProgressScore = 75;
    } else if (baseProgressScore > 0) {
      baseProgressScore = Math.max(60, baseProgressScore);
    }

    const blockedPenalty          = Math.min(45, blockedTasks * 15);
    const overduePenalty          = Math.min(30, overdueTasks * 10);
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
      baseProgressScore - blockedPenalty - overduePenalty -
      delayedMilestonePenalty - goalDeadlinePenalty;

    if (totalTasks > 0 && doneTasks === totalTasks && totalMilestones === completedMilestones) {
      computedScore = 100;
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(computedScore)));
  const degraded   = finalScore < goal.healthScore && finalScore < 70;

  const status: GoalHealthStatus =
    finalScore < 40 ? "at_risk" :
    finalScore < 70 ? "needs_attention" :
    "on_track";

  return {
    finalScore,
    status,
    degraded,
    metrics: {
      totalMilestones, completedMilestones, delayedMilestones,
      totalTasks, doneTasks, blockedTasks, overdueTasks,
    },
    newlyDelayedMilestoneIds,
  };
}

// ── Single-goal path (triggered from API / webhooks) ──────────────────────

/**
 * Calculates and persists the dynamic health score (0–100) for a given Goal.
 */
export async function calculateGoalHealth(goalId: string): Promise<GoalHealthEvaluation | null> {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      milestones: {
        include: {
          tasks: { select: { id: true, status: true, dueDate: true, priority: true } },
        },
      },
    },
  });
  if (!goal) return null;

  const now      = new Date();
  const allTasks = goal.milestones.flatMap((m) => m.tasks);

  const result = computeHealthScore(goal, goal.milestones, allTasks, now);
  const { finalScore, status, degraded, metrics, newlyDelayedMilestoneIds } = result;

  // Persist newly-detected delayed milestones
  if (newlyDelayedMilestoneIds.length > 0) {
    await prisma.milestone.updateMany({
      where: { id: { in: newlyDelayedMilestoneIds }, status: { not: "delayed" } },
      data: { status: "delayed" },
    }).catch((err) => console.error("[goal-health] Auto milestone delay update error:", err));
  }

  if (finalScore !== goal.healthScore) {
    await prisma.goal.update({ where: { id: goalId }, data: { healthScore: finalScore } });

    if (Math.abs(finalScore - goal.healthScore) >= 10 || degraded) {
      await prisma.activityLog.create({
        data: {
          workspaceId: goal.workspaceId,
          userId: goal.ownerId ?? null,
          entityType: "goal",
          entityId: goalId,
          action: "health_score_updated",
          diff: {
            previousScore: goal.healthScore,
            newScore: finalScore,
            healthStatus: status,
            blockedTasks: metrics.blockedTasks,
            overdueTasks: metrics.overdueTasks,
            delayedMilestones: metrics.delayedMilestones,
          },
        },
      }).catch((err) => console.error("[goal-health] Activity log write error:", err));
    }
  }

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    workspaceId: goal.workspaceId,
    previousScore: goal.healthScore,
    healthScore: finalScore,
    status,
    degraded,
    metrics,
  };
}

// ── Bulk workspace path (triggered from cron sweep) ────────────────────────

async function evaluateWorkspaceGoalsHealth(workspaceId: string): Promise<GoalHealthEvaluation[]> {
  const goals = await prisma.goal.findMany({
    where: { status: { in: ["active", "draft"] }, workspaceId },
    include: {
      milestones: {
        include: {
          tasks: { select: { id: true, status: true, dueDate: true, priority: true } },
        },
      },
    },
  });

  if (goals.length === 0) return [];

  const now         = new Date();
  const evaluations: GoalHealthEvaluation[] = [];
  const allNewlyDelayed: string[] = [];
  const goalsToUpdate: Array<{
    id: string;
    healthScore: number;
    workspaceId: string;
    ownerId: string | null;
    previousScore: number;
    degraded: boolean;
    status: GoalHealthStatus;
    metrics: GoalHealthEvaluation["metrics"];
  }> = [];

  for (const goal of goals) {
    const allTasks = goal.milestones.flatMap((m) => m.tasks);
    const result   = computeHealthScore(goal, goal.milestones, allTasks, now);
    const { finalScore, status, degraded, metrics, newlyDelayedMilestoneIds } = result;

    allNewlyDelayed.push(...newlyDelayedMilestoneIds);

    evaluations.push({
      goalId: goal.id,
      goalTitle: goal.title,
      workspaceId: goal.workspaceId,
      previousScore: goal.healthScore,
      healthScore: finalScore,
      status,
      degraded,
      metrics,
    });

    if (finalScore !== goal.healthScore) {
      goalsToUpdate.push({
        id: goal.id, healthScore: finalScore,
        workspaceId: goal.workspaceId, ownerId: goal.ownerId,
        previousScore: goal.healthScore, degraded, status, metrics,
      });
    }
  }

  // Batch update newly-delayed milestones
  if (allNewlyDelayed.length > 0) {
    await prisma.milestone.updateMany({
      where: { id: { in: allNewlyDelayed }, status: { not: "delayed" } },
      data: { status: "delayed" },
    }).catch((err) => console.error("[goal-health] Batch delayed milestones update error:", err));
  }

  // Bulk update goal health scores in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < goalsToUpdate.length; i += CHUNK_SIZE) {
    const chunk = goalsToUpdate.slice(i, i + CHUNK_SIZE);
    await prisma
      .$transaction(
        chunk.map((g) => prisma.goal.update({ where: { id: g.id }, data: { healthScore: g.healthScore } }))
      )
      .catch((err) => console.error("[goal-health] Batch goal health update error:", err));
  }

  return evaluations;
}

/**
 * Re-evaluates health scores for all active goals across all or a specific workspace.
 */
export async function evaluateAllGoalsHealth(
  workspaceId?: string
): Promise<GoalHealthEvaluation[]> {
  if (workspaceId) {
    try {
      return await evaluateWorkspaceGoalsHealth(workspaceId);
    } catch (err) {
      console.error(`[goal-health] Evaluation failed for workspace ${workspaceId}:`, err);
      return [];
    }
  }

  const workspaceGroups = await prisma.goal.groupBy({
    by: ["workspaceId"],
    where: { status: { in: ["active", "draft"] } },
  });

  const allEvaluations: GoalHealthEvaluation[] = [];
  for (const group of workspaceGroups) {
    try {
      const evals = await evaluateWorkspaceGoalsHealth(group.workspaceId);
      allEvaluations.push(...evals);
    } catch (err) {
      console.error(`[goal-health] Evaluation failed for workspace ${group.workspaceId}:`, err);
    }
  }
  return allEvaluations;
}
