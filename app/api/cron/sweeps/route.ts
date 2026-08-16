import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateAllGoalsHealth } from "@/lib/goal-health";
import { evaluateQuotaThresholds, checkAndRecordQuotaWarning } from "@/lib/quota-alerts";
import {
  dispatchMilestoneDelayedNotification,
  dispatchTaskDueAlert,
  dispatchGoalHealthNotification,
  dispatchQuotaNotification,
} from "@/lib/notifications";

import { timingSafeEqual } from "crypto";

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * GET /api/cron/sweeps
 *
 * Automated background sweeper that handles:
 * 1. Task due dates & overdue sweeps (24h/48h windows & overdue detection).
 * 2. Milestone slippage evaluation & auto-marking overdue milestones as "delayed".
 * 3. Goal health score recalculation across all active workspaces.
 * 4. Proactive AI & storage quota threshold sweeps (80%/90% capacity warnings).
 *
 * Protected by CRON_SECRET verification.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = cronSecretHeader || bearerToken;

  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || expectedSecret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!token || !safeCompare(token, "dev-cron-secret")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    if (!token || !safeCompare(token, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // ── 1. Task Due Date & Overdue Sweeps (Single Consolidated Query) ────────
  const candidateTasks = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      dueDate: { lte: fortyEightHoursFromNow },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assigneeId: true,
      milestone: {
        select: {
          id: true,
          goal: { select: { id: true, workspaceId: true } },
        },
      },
    },
  });

  const nowTime = now.getTime();
  const twentyFourHoursTime = twentyFourHoursFromNow.getTime();

  const overdueTasks: typeof candidateTasks = [];
  const dueSoon24hTasks: typeof candidateTasks = [];
  const dueUpcoming48hTasks: typeof candidateTasks = [];

  for (const t of candidateTasks) {
    if (!t.dueDate) continue;
    const dueTime = new Date(t.dueDate).getTime();
    if (dueTime < nowTime) {
      overdueTasks.push(t);
    } else if (dueTime <= twentyFourHoursTime) {
      dueSoon24hTasks.push(t);
    } else {
      dueUpcoming48hTasks.push(t);
    }
  }

  // ── 2. Milestone Slippage & Auto-Delay ─────────────────────────────────────
  const slippingMilestones = await prisma.milestone.findMany({
    where: {
      status: { notIn: ["completed", "delayed"] },
      targetDate: { lt: now },
    },
    select: {
      id: true,
      title: true,
      targetDate: true,
      goal: { select: { id: true, workspaceId: true } },
    },
  });

  let newlyDelayedCount = 0;
  if (slippingMilestones.length > 0) {
    const ids = slippingMilestones.map((m) => m.id);
    const updateResult = await prisma.milestone.updateMany({
      where: { id: { in: ids } },
      data: { status: "delayed" },
    });
    newlyDelayedCount = updateResult.count;

    // Record activity logs & dispatch notifications for delayed milestones
    for (const m of slippingMilestones) {
      await prisma.activityLog.create({
        data: {
          workspaceId: m.goal.workspaceId,
          userId: null,
          entityType: "milestone",
          entityId: m.id,
          action: "milestone_delayed_auto",
          diff: {
            reason: "Target date elapsed without completion",
            targetDate: m.targetDate,
            detectedAt: now.toISOString(),
          },
        },
      }).catch((err) => console.error("[cron/sweeps] Activity log failed for milestone:", err));

      // Dispatch milestone delayed notification
      dispatchMilestoneDelayedNotification({
        milestoneId: m.id,
        milestoneTitle: m.title,
        targetDate: m.targetDate,
        goalId: m.goal.id,
        workspaceId: m.goal.workspaceId,
      }).catch((err) => console.error("[cron/sweeps] Milestone delayed notification failed:", err));
    }
  }

  // ── Dispatch Task Due Date Notifications (Deduplicated within 24h via batch fetch) ──
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const candidateTaskIds = [
    ...overdueTasks.map((t) => t.id),
    ...dueSoon24hTasks.map((t) => t.id),
  ];

  const recentTaskNotifs = await prisma.notification.findMany({
    where: {
      entityId: { in: candidateTaskIds },
      createdAt: { gte: oneDayAgo },
    },
    select: { entityId: true, type: true, userId: true },
  });

  const recentNotifSet = new Set(
    recentTaskNotifs.map((n) => `${n.userId}:${n.entityId}:${n.type}`)
  );

  for (const t of overdueTasks) {
    if (!t.assigneeId || !t.dueDate) continue;
    const notifKey = `${t.assigneeId}:${t.id}:task_overdue`;
    if (!recentNotifSet.has(notifKey)) {
      recentNotifSet.add(notifKey);
      dispatchTaskDueAlert({
        taskId: t.id,
        taskTitle: t.title,
        dueDate: t.dueDate,
        assigneeId: t.assigneeId,
        workspaceId: t.milestone.goal.workspaceId,
        isOverdue: true,
      }).catch((err) => console.error("[cron/sweeps] Overdue task notification failed:", err));
    }
  }

  for (const t of dueSoon24hTasks) {
    if (!t.assigneeId || !t.dueDate) continue;
    const notifKey = `${t.assigneeId}:${t.id}:task_due_soon`;
    if (!recentNotifSet.has(notifKey)) {
      recentNotifSet.add(notifKey);
      dispatchTaskDueAlert({
        taskId: t.id,
        taskTitle: t.title,
        dueDate: t.dueDate,
        assigneeId: t.assigneeId,
        workspaceId: t.milestone.goal.workspaceId,
        isOverdue: false,
      }).catch((err) => console.error("[cron/sweeps] Due soon task notification failed:", err));
    }
  }

  // ── 3. Goal Health Recalculation & Alerts ─────────────────────────────────
  const goalEvaluations = await evaluateAllGoalsHealth();
  const atRiskGoals = goalEvaluations.filter((g) => g.status === "at_risk");
  const degradedGoals = goalEvaluations.filter((g) => g.degraded);

  if (atRiskGoals.length > 0) {
    const atRiskGoalIds = atRiskGoals.map((g) => g.goalId);
    const [recentGoalNotifs, goalOwners] = await Promise.all([
      prisma.notification.findMany({
        where: {
          entityId: { in: atRiskGoalIds },
          type: { in: ["goal_at_risk", "goal_health_degraded"] },
          createdAt: { gte: oneDayAgo },
        },
        select: { entityId: true },
      }),
      prisma.goal.findMany({
        where: { id: { in: atRiskGoalIds } },
        select: { id: true, ownerId: true, workspaceId: true },
      }),
    ]);

    const recentAlertedGoalIds = new Set(recentGoalNotifs.map((n) => n.entityId));
    const goalMap = new Map(goalOwners.map((g) => [g.id, g]));

    for (const g of atRiskGoals) {
      if (!recentAlertedGoalIds.has(g.goalId)) {
        const goal = goalMap.get(g.goalId);
        if (goal) {
          dispatchGoalHealthNotification({
            goalId: g.goalId,
            goalTitle: g.goalTitle,
            healthScore: g.healthScore,
            workspaceId: goal.workspaceId,
            ownerId: goal.ownerId,
            degraded: g.degraded,
          }).catch((err) => console.error("[cron/sweeps] Goal health alert failed:", err));
        }
      }
    }
  }

  // ── 4. Quota Threshold Warnings (AI & Storage) ───────────────────────────
  const allWorkspaces = await prisma.workspace.findMany({
    select: { id: true, ownerId: true },
  });

  const quotaWarnings: Array<Record<string, unknown>> = [];
  const CHUNK_SIZE = 10;

  for (let i = 0; i < allWorkspaces.length; i += CHUNK_SIZE) {
    const chunk = allWorkspaces.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(
      chunk.map(async (ws) => {
        try {
          const quotaEval = await evaluateQuotaThresholds(ws.id);
          if (quotaEval && quotaEval.hasAnyWarning) {
            await checkAndRecordQuotaWarning(ws.id, quotaEval, ws.ownerId);
            quotaWarnings.push({
              workspaceId: ws.id,
              workspaceName: quotaEval.workspaceName,
              plan: quotaEval.plan,
              aiWarning: quotaEval.aiCredits.warningLevel,
              aiPercent: quotaEval.aiCredits.percentage,
              storageWarning: quotaEval.storage.warningLevel,
              storagePercent: quotaEval.storage.percentage,
            });

            if (quotaEval.aiCredits.warningLevel !== "none" && ws.ownerId) {
              const recentAiNotif = await prisma.notification.findFirst({
                where: {
                  userId: ws.ownerId,
                  workspaceId: ws.id,
                  type: { in: ["quota_warning", "quota_exceeded"] },
                  createdAt: { gte: oneDayAgo },
                },
              });
              if (!recentAiNotif) {
                dispatchQuotaNotification({
                  workspaceId: ws.id,
                  workspaceName: quotaEval.workspaceName,
                  type: "ai_credits",
                  warningLevel: quotaEval.aiCredits.warningLevel,
                  percentage: quotaEval.aiCredits.percentage,
                  ownerId: ws.ownerId,
                }).catch((err) => console.error("[cron/sweeps] AI quota notification failed:", err));
              }
            }
          }
        } catch (err) {
          console.error(`[cron/sweeps] Quota check failed for workspace ${ws.id}:`, err);
        }
      })
    );
  }

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    taskSweep: {
      overdueCount: overdueTasks.length,
      dueSoon24hCount: dueSoon24hTasks.length,
      dueUpcoming48hCount: dueUpcoming48hTasks.length,
    },
    milestoneSweep: {
      slippingDetected: slippingMilestones.length,
      newlyDelayedCount,
    },
    goalHealthSweep: {
      totalEvaluated: goalEvaluations.length,
      atRiskCount: atRiskGoals.length,
      degradedCount: degradedGoals.length,
    },
    quotaSweep: {
      totalWorkspacesChecked: allWorkspaces.length,
      workspacesWithWarningsCount: quotaWarnings.length,
    },
  });
}
