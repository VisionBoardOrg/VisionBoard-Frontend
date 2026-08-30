import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { evaluateAllGoalsHealth } from "@/lib/goal-health";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { evaluateQuotaThresholds, checkAndRecordQuotaWarning } from "@/lib/quota-alerts";
import {
  dispatchTaskDueAlert,
  dispatchGoalHealthNotification,
  dispatchQuotaNotification,
} from "@/lib/notifications";
import { runUserCleanup, UserCleanupResult } from "@/lib/user-cleanup";
import { safeCompare } from "@/lib/auth/safe-compare";
import { acquireCronLock } from "@/lib/cron-lock";

function authorizeCron(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = cronSecretHeader || bearerToken;
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || expectedSecret.length < 16) {
    if (process.env.NODE_ENV === "production") return false;
    return !!(token && safeCompare(token, "dev-cron-secret"));
  }
  return !!(token && safeCompare(token, expectedSecret));
}

// ── Per-run caps — prevents a single cron invocation from holding the DB
// connection pool hostage on a large platform.
const TASK_CAP        = 1000;
const MILESTONE_CAP   = 1000;
const WORKSPACE_CAP   = 500; // max workspaces checked for quota in one run
const NOTIF_CHUNK     = 10;  // parallel notification dispatches per batch

/**
 * GET /api/cron/sweeps
 *
 * Daily background sweep handling:
 * 1. Task due-date & overdue alerts (capped at TASK_CAP rows)
 * 2. Milestone slippage detection & auto-delay (capped at MILESTONE_CAP rows)
 * 3. Goal health recalculation across all active workspaces
 * 4. Proactive AI & storage quota threshold warnings
 * 5. Retention cleanup — activity logs, read notifications, AI generation logs
 * 6. Account deletion warnings & purge
 *
 * Each phase is independently try/catched so a failure in one phase never
 * aborts the remaining phases.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Distributed lock — prevent parallel cron triggers from double-alerting ──
  // Vercel Cron can occasionally fire duplicate triggers within milliseconds.
  // Two parallel runs share no in-process state, so both would find the same
  // overdue tasks and dispatch duplicate notifications to users.
  // The lock (Redis SET NX when Upstash is configured, in-process Map otherwise)
  // ensures only one run proceeds; the duplicate immediately returns 409.
  const { acquired, lock } = await acquireCronLock("sweeps", 5 * 60 * 1000);
  if (!acquired) {
    console.log("[cron/sweeps] Parallel trigger detected — skipping (lock held by another run).");
    return NextResponse.json(
      { skipped: true, reason: "parallel run in progress" },
      { status: 409 }
    );
  }

  const now = new Date();
  const oneDayAgo              = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fortyEightHoursFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const results: Record<string, unknown> = { success: true, timestamp: now.toISOString() };

  try {

  // ── Phase 1: Task due-date sweep ─────────────────────────────────────────
  try {
    const candidateTasks = await prisma.task.findMany({
      where: { status: { not: "done" }, dueDate: { lte: fortyEightHoursFromNow } },
      take: TASK_CAP,
      select: {
        id: true, title: true, dueDate: true, assigneeId: true,
        milestone: { select: { id: true, goal: { select: { id: true, workspaceId: true } } } },
      },
    });

    const nowTime = now.getTime();
    const twentyFourHoursTime = twentyFourHoursFromNow.getTime();

    const overdueTasks:    typeof candidateTasks = [];
    const dueSoon24hTasks: typeof candidateTasks = [];

    for (const t of candidateTasks) {
      if (!t.dueDate) continue;
      const dueTime = new Date(t.dueDate).getTime();
      if (dueTime < nowTime) overdueTasks.push(t);
      else if (dueTime <= twentyFourHoursTime) dueSoon24hTasks.push(t);
    }

    // Deduplicate: fetch recent notifications for all candidate task ids in one query
    const candidateTaskIds = [
      ...overdueTasks.map((t) => t.id),
      ...dueSoon24hTasks.map((t) => t.id),
    ];

    const recentTaskNotifs = candidateTaskIds.length > 0
      ? await prisma.notification.findMany({
          where: { entityId: { in: candidateTaskIds }, createdAt: { gte: oneDayAgo } },
          select: { entityId: true, type: true, userId: true },
        })
      : [];

    const recentNotifSet = new Set(
      recentTaskNotifs.map((n) => `${n.userId}:${n.entityId}:${n.type}`)
    );

    const taskAlerts = [
      ...overdueTasks
        .filter((t) => {
          if (!t.assigneeId || !t.dueDate) return false;
          const key = `${t.assigneeId}:${t.id}:task_overdue`;
          if (recentNotifSet.has(key)) return false;
          recentNotifSet.add(key);
          return true;
        })
        .map((t) =>
          dispatchTaskDueAlert({
            taskId: t.id, taskTitle: t.title, dueDate: t.dueDate!,
            assigneeId: t.assigneeId!, workspaceId: t.milestone.goal.workspaceId, isOverdue: true,
          }).catch((err) => console.error("[cron/sweeps] Overdue task notification failed:", err))
        ),
      ...dueSoon24hTasks
        .filter((t) => {
          if (!t.assigneeId || !t.dueDate) return false;
          const key = `${t.assigneeId}:${t.id}:task_due_soon`;
          if (recentNotifSet.has(key)) return false;
          recentNotifSet.add(key);
          return true;
        })
        .map((t) =>
          dispatchTaskDueAlert({
            taskId: t.id, taskTitle: t.title, dueDate: t.dueDate!,
            assigneeId: t.assigneeId!, workspaceId: t.milestone.goal.workspaceId, isOverdue: false,
          }).catch((err) => console.error("[cron/sweeps] Due-soon task notification failed:", err))
        ),
    ];

    // Fire in chunks to avoid saturating the connection pool
    for (let i = 0; i < taskAlerts.length; i += NOTIF_CHUNK) {
      await Promise.allSettled(taskAlerts.slice(i, i + NOTIF_CHUNK));
    }

    results.taskSweep = {
      overdueCount: overdueTasks.length,
      dueSoon24hCount: dueSoon24hTasks.length,
    };
  } catch (err) {
    console.error("[cron/sweeps] Phase 1 (task sweep) failed:", err);
    results.taskSweep = { error: "phase failed" };
  }

  // ── Phase 2: Milestone slippage ──────────────────────────────────────────
  try {
    const slippingMilestones = await prisma.milestone.findMany({
      where: { status: { notIn: ["completed", "delayed"] }, targetDate: { lt: now } },
      take: MILESTONE_CAP,
      select: {
        id: true, title: true, targetDate: true,
        goal: { select: { id: true, workspaceId: true } },
      },
    });

    let newlyDelayedCount = 0;
    if (slippingMilestones.length > 0) {
      const ids = slippingMilestones.map((m) => m.id);

      // Batch update + activity logs in a single transaction
      const [updateResult] = await prisma.$transaction([
        prisma.milestone.updateMany({ where: { id: { in: ids } }, data: { status: "delayed" } }),
        prisma.activityLog.createMany({
          data: slippingMilestones.map((m) => ({
            workspaceId: m.goal.workspaceId,
            userId: null as string | null,
            entityType: "milestone",
            entityId: m.id,
            action: "milestone_delayed_auto",
            diff: {
              reason: "Target date elapsed without completion",
              targetDate: m.targetDate,
              detectedAt: now.toISOString(),
            },
          })),
        }),
      ]);
      newlyDelayedCount = updateResult.count;

      // Pre-fetch all goal owners and workspace admins in bulk — avoids N×2 queries
      // (was: prisma.goal.findUnique + prisma.workspaceMember.findMany per milestone)
      const uniqueGoalIds      = [...new Set(slippingMilestones.map((m) => m.goal.id))];
      const uniqueWorkspaceIds = [...new Set(slippingMilestones.map((m) => m.goal.workspaceId))];

      const [goalOwners, wsAdmins] = await Promise.all([
        prisma.goal.findMany({
          where: { id: { in: uniqueGoalIds } },
          select: { id: true, ownerId: true },
        }),
        prisma.workspaceMember.findMany({
          where: { workspaceId: { in: uniqueWorkspaceIds }, role: { in: ["admin", "pm"] } },
          select: { userId: true, workspaceId: true },
        }),
      ]);

      const goalOwnerMap = new Map(goalOwners.map((g) => [g.id, g.ownerId]));
      const wsAdminMap   = new Map<string, string[]>();
      for (const a of wsAdmins) {
        const arr = wsAdminMap.get(a.workspaceId) ?? [];
        arr.push(a.userId);
        wsAdminMap.set(a.workspaceId, arr);
      }

      const milestoneNotifs = slippingMilestones.map((m) => {
        const recipients = new Set<string>();
        const ownerId = goalOwnerMap.get(m.goal.id);
        if (ownerId) recipients.add(ownerId);
        (wsAdminMap.get(m.goal.workspaceId) ?? []).forEach((id) => recipients.add(id));

        return Array.from(recipients).map((userId) =>
          prisma.notification.create({
            data: {
              userId,
              workspaceId: m.goal.workspaceId,
              actorId: null,
              type: "milestone_delayed",
              title: `Milestone Delayed: ${m.title}`,
              message: `"${m.title}" elapsed without completion${m.targetDate ? ` (target was ${m.targetDate.toLocaleDateString()})` : ""}.`,
              entityType: "milestone",
              entityId: m.id,
              link: `/workspace/${m.goal.workspaceId}/goals?goalId=${m.goal.id}`,
            },
          }).catch((err) => console.error("[cron/sweeps] Milestone notif failed:", err))
        );
      }).flat();

      for (let i = 0; i < milestoneNotifs.length; i += NOTIF_CHUNK) {
        await Promise.allSettled(milestoneNotifs.slice(i, i + NOTIF_CHUNK));
      }
    }

    results.milestoneSweep = { slippingDetected: slippingMilestones.length, newlyDelayedCount };
  } catch (err) {
    console.error("[cron/sweeps] Phase 2 (milestone sweep) failed:", err);
    results.milestoneSweep = { error: "phase failed" };
  }

  // ── Phase 3: Goal health recalculation ───────────────────────────────────
  try {
    const goalEvaluations = await evaluateAllGoalsHealth();
    const atRiskGoals = goalEvaluations.filter((g) => g.status === "at_risk" || g.degraded);

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

      const healthAlerts = atRiskGoals
        .filter((g) => !recentAlertedGoalIds.has(g.goalId))
        .map((g) => {
          const goal = goalMap.get(g.goalId);
          if (!goal) return null;
          return dispatchGoalHealthNotification({
            goalId: g.goalId, goalTitle: g.goalTitle, healthScore: g.healthScore,
            workspaceId: goal.workspaceId, ownerId: goal.ownerId, degraded: g.degraded,
          }).catch((err) => console.error("[cron/sweeps] Goal health alert failed:", err));
        })
        .filter(Boolean) as Promise<unknown>[];

      for (let i = 0; i < healthAlerts.length; i += NOTIF_CHUNK) {
        await Promise.allSettled(healthAlerts.slice(i, i + NOTIF_CHUNK));
      }
    }

    results.goalHealthSweep = {
      totalEvaluated: goalEvaluations.length,
      atRiskCount: atRiskGoals.length,
    };
  } catch (err) {
    console.error("[cron/sweeps] Phase 3 (goal health) failed:", err);
    results.goalHealthSweep = { error: "phase failed" };
  }

  // ── Phase 4: Quota threshold warnings ────────────────────────────────────
  // Single workspace scan reused for both quota checks and retention cleanup.
  let allWorkspaces: Array<{ id: string; ownerId: string; owner: { plan: string } }> = [];
  try {
    allWorkspaces = await prisma.workspace.findMany({
      take: WORKSPACE_CAP,
      select: { id: true, ownerId: true, owner: { select: { plan: true } } },
    });

    const quotaWarnings: unknown[] = [];

    for (let i = 0; i < allWorkspaces.length; i += NOTIF_CHUNK) {
      const chunk = allWorkspaces.slice(i, i + NOTIF_CHUNK);
      await Promise.allSettled(
        chunk.map(async (ws) => {
          try {
            const quotaEval = await evaluateQuotaThresholds(ws.id);
            if (!quotaEval?.hasAnyWarning) return;

            await checkAndRecordQuotaWarning(ws.id, quotaEval, ws.ownerId);
            quotaWarnings.push({
              workspaceId: ws.id,
              aiWarning: quotaEval.aiCredits.warningLevel,
              storageWarning: quotaEval.storage.warningLevel,
            });

            // Check for recent quota notifications before dispatching (single query)
            if (quotaEval.aiCredits.warningLevel !== "none" && ws.ownerId) {
              const recentAiNotif = await prisma.notification.findFirst({
                where: {
                  userId: ws.ownerId, workspaceId: ws.id,
                  type: { in: ["quota_warning", "quota_exceeded"] },
                  createdAt: { gte: oneDayAgo },
                },
                select: { id: true },
              });
              if (!recentAiNotif) {
                dispatchQuotaNotification({
                  workspaceId: ws.id, workspaceName: quotaEval.workspaceName,
                  type: "ai_credits", warningLevel: quotaEval.aiCredits.warningLevel,
                  percentage: quotaEval.aiCredits.percentage, ownerId: ws.ownerId,
                }).catch((err) => console.error("[cron/sweeps] Quota notification failed:", err));
              }
            }
          } catch (err) {
            console.error(`[cron/sweeps] Quota check failed for workspace ${ws.id}:`, err);
          }
        })
      );
    }

    results.quotaSweep = {
      totalWorkspacesChecked: allWorkspaces.length,
      workspacesWithWarningsCount: quotaWarnings.length,
    };
  } catch (err) {
    console.error("[cron/sweeps] Phase 4 (quota sweep) failed:", err);
    results.quotaSweep = { error: "phase failed" };
  }

  // ── Phase 5: Retention cleanup ────────────────────────────────────────────
  try {
    let activityLogsDeleted    = 0;
    let readNotificationsDeleted = 0;
    let aiLogsDeleted          = 0;

    // a) Activity logs — group workspaces by retention window to run one
    //    deleteMany per tier instead of one per workspace
    const retentionGroups = new Map<number, string[]>();
    for (const ws of allWorkspaces) {
      const plan = (ws.owner.plan ?? "free") as keyof typeof PLAN_LIMITS;
      const days = PLAN_LIMITS[plan]?.activityLogDays ?? 7;
      if (days < 0) continue; // unlimited (enterprise)
      const ids = retentionGroups.get(days);
      if (ids) ids.push(ws.id);
      else retentionGroups.set(days, [ws.id]);
    }

    for (const [days, workspaceIds] of retentionGroups) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const result = await prisma.activityLog.deleteMany({
        where: { workspaceId: { in: workspaceIds }, createdAt: { lt: cutoff } },
      });
      activityLogsDeleted += result.count;
    }

    // b) Read notifications older than 90 days
    const notifCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const notifResult = await prisma.notification.deleteMany({
      where: { read: true, readAt: { lt: notifCutoff } },
    });
    readNotificationsDeleted = notifResult.count;

    // c) AI generation logs — keep same window as activity logs per plan
    //    Use 90 days as a safe default for workspaces not in our current scan cap
    const aiLogCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const aiLogResult = await prisma.aIGenerationLog.deleteMany({
      where: { createdAt: { lt: aiLogCutoff } },
    });
    aiLogsDeleted = aiLogResult.count;

    results.retentionSweep = { activityLogsDeleted, readNotificationsDeleted, aiLogsDeleted };
  } catch (err) {
    console.error("[cron/sweeps] Phase 5 (retention cleanup) failed:", err);
    results.retentionSweep = { error: "phase failed" };
  }

  // ── Phase 6: User account deletion ───────────────────────────────────────
  let userCleanup: UserCleanupResult = { warningsSent: 0, purgedCount: 0, purgedUserIds: [] };
  try {
    userCleanup = await runUserCleanup();
  } catch (err) {
    console.error("[cron/sweeps] Phase 6 (user cleanup) failed:", err);
  }
  results.userCleanupSweep = userCleanup;

  return NextResponse.json(results);
  } finally {
    // Release the lock early so the slot is free for the next scheduled run
    // rather than waiting for the full TTL to expire.
    await lock.release();
  }
}
