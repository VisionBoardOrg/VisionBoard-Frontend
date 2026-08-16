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

  const expectedSecret = process.env.CRON_SECRET || "dev-cron-secret";

  if (process.env.NODE_ENV === "production" && token !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  // ── 1. Task Due Date & Overdue Sweeps ─────────────────────────────────────
  const overdueTasks = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      dueDate: { lt: now },
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

  const dueSoon24hTasks = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      dueDate: {
        gte: now,
        lte: twentyFourHoursFromNow,
      },
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

  const dueUpcoming48hTasks = await prisma.task.findMany({
    where: {
      status: { not: "done" },
      dueDate: {
        gt: twentyFourHoursFromNow,
        lte: fortyEightHoursFromNow,
      },
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

  // ── Dispatch Task Due Date Notifications (Deduplicated within 24h) ────────
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const t of overdueTasks) {
    if (!t.assigneeId || !t.dueDate) continue;
    const existingNotif = await prisma.notification.findFirst({
      where: {
        userId: t.assigneeId,
        entityId: t.id,
        type: "task_overdue",
        createdAt: { gte: oneDayAgo },
      },
    });
    if (!existingNotif) {
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
    const existingNotif = await prisma.notification.findFirst({
      where: {
        userId: t.assigneeId,
        entityId: t.id,
        type: "task_due_soon",
        createdAt: { gte: oneDayAgo },
      },
    });
    if (!existingNotif) {
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

  for (const g of atRiskGoals) {
    const existingNotif = await prisma.notification.findFirst({
      where: {
        entityId: g.goalId,
        type: { in: ["goal_at_risk", "goal_health_degraded"] },
        createdAt: { gte: oneDayAgo },
      },
    });
    if (!existingNotif) {
      // Find goal owner
      const goal = await prisma.goal.findUnique({
        where: { id: g.goalId },
        select: { ownerId: true, workspaceId: true },
      });
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

  // ── 4. Quota Threshold Warnings (AI & Storage) ───────────────────────────
  const allWorkspaces = await prisma.workspace.findMany({
    select: { id: true, ownerId: true },
  });

  const quotaWarnings = [];
  for (const ws of allWorkspaces) {
    try {
      const quotaEval = await evaluateQuotaThresholds(ws.id);
      if (quotaEval && quotaEval.hasAnyWarning) {
        await checkAndRecordQuotaWarning(ws.id);
        quotaWarnings.push({
          workspaceId: ws.id,
          workspaceName: quotaEval.workspaceName,
          plan: quotaEval.plan,
          aiWarning: quotaEval.aiCredits.warningLevel,
          aiPercent: quotaEval.aiCredits.percentage,
          storageWarning: quotaEval.storage.warningLevel,
          storagePercent: quotaEval.storage.percentage,
        });

        // Dispatch quota notifications to workspace owner if not alerted in 24h
        if (quotaEval.aiCredits.warningLevel !== "none" && ws.ownerId) {
          const recentAiNotif = await prisma.notification.findFirst({
            where: {
              userId: ws.ownerId,
              workspaceId: ws.id,
              type: { in: ["quota_warning", "quota_exceeded"] },
              metadata: { path: ["type"], equals: "ai_credits" },
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
  }

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    taskSweep: {
      overdueCount: overdueTasks.length,
      dueSoon24hCount: dueSoon24hTasks.length,
      dueUpcoming48hCount: dueUpcoming48hTasks.length,
      overdueTaskIds: overdueTasks.map((t) => t.id),
      dueSoon24hTaskIds: dueSoon24hTasks.map((t) => t.id),
    },
    milestoneSweep: {
      slippingDetected: slippingMilestones.length,
      newlyDelayedCount,
      delayedMilestoneIds: slippingMilestones.map((m) => m.id),
    },
    goalHealthSweep: {
      totalEvaluated: goalEvaluations.length,
      atRiskCount: atRiskGoals.length,
      degradedCount: degradedGoals.length,
      evaluations: goalEvaluations.map((g) => ({
        goalId: g.goalId,
        title: g.goalTitle,
        healthScore: g.healthScore,
        status: g.status,
        degraded: g.degraded,
      })),
    },
    quotaSweep: {
      totalWorkspacesChecked: allWorkspaces.length,
      workspacesWithWarningsCount: quotaWarnings.length,
      warnings: quotaWarnings,
    },
  });
}
