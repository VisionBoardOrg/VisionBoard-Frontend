import { prisma } from "@/lib/prisma";

/**
 * Shared server-side data helpers for /admin overview + AI analytics pages.
 *
 * ⚠ These helpers call prisma DIRECTLY (no HTTP fetch-to-self). Use them from
 * React Server Components or Route Handlers. The REST route handlers also
 * delegate to these so the logic stays in one place.
 *
 * They return `null` on DB-unreachable errors so callers can show a soft
 * failure UI instead of crashing the page. Non-DB errors are thrown.
 */

// ── Overview ──────────────────────────────────────────────────────────────────

export interface AdminOverviewKpis {
  totalUsers: number;
  newUsersLast30d: number;
  newUsersLast7d: number;
  totalWorkspaces: number;
  totalTasks: number;
  totalGoals: number;
  activeSubscriptions: number;
  scheduledDeletions: number;
  aiTokensLast30d: number;
  aiCallsLast30d: number;
}

export interface AdminOverviewData {
  kpis: AdminOverviewKpis;
  planBreakdown: Record<string, number>;
  recentActivity: Array<{
    id: string;
    entityType: string;
    action: string;
    createdAt: Date;
    user: { name?: string | null; email: string } | null;
    workspace: { name: string; slug: string } | null;
  }>;
}

function isDbUnavailable(err: unknown): boolean {
  const msg =
    (err as { name?: string; message?: string })?.name +
    " " +
    (err as { name?: string; message?: string })?.message;
  return /Can't reach database server|PrismaClient(Initialization|Runtime|Ratelimit)Error|database connection is not available|timed out|pgbouncer|SSL connection has been closed|the database system is starting up|too many clients already|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENOTFOUND/i.test(
    msg
  );
}

export async function getAdminOverview(): Promise<AdminOverviewData | null> {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersLast30d,
      newUsersLast7d,
      totalWorkspaces,
      totalTasks,
      totalGoals,
      activeSubscriptions,
      planBreakdown,
      recentActivity,
      aiUsageLast30d,
      scheduledDeletions,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.workspace.count(),
      prisma.task.count(),
      prisma.goal.count(),
      prisma.user.count({ where: { stripeSubscriptionId: { not: null } } }),
      prisma.user.groupBy({
        by: ["plan"],
        _count: { plan: true },
      }),
      prisma.activityLog.findMany({
        where: { createdAt: { gte: yesterday } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          user: { select: { name: true, email: true } },
          workspace: { select: { name: true, slug: true } },
        },
      }),
      prisma.aIGenerationLog.aggregate({
        where: { createdAt: { gte: thirtyDaysAgo } },
        _sum: { tokensUsed: true },
        _count: { id: true },
      }),
      prisma.user.count({ where: { scheduledDeletion: { not: null } } }),
    ]);

    const planMap: Record<string, number> = {};
    for (const p of planBreakdown) {
      planMap[p.plan] = p._count.plan;
    }

    return {
      kpis: {
        totalUsers,
        newUsersLast30d,
        newUsersLast7d,
        totalWorkspaces,
        totalTasks,
        totalGoals,
        activeSubscriptions,
        scheduledDeletions,
        aiTokensLast30d: (aiUsageLast30d._sum.tokensUsed as number | null) ?? 0,
        aiCallsLast30d: aiUsageLast30d._count.id,
      },
      planBreakdown: planMap,
      recentActivity: recentActivity.map((log) => ({
        id: log.id,
        entityType: log.entityType,
        action: log.action,
        createdAt: log.createdAt,
        user: log.user,
        workspace: log.workspace,
      })),
    };
  } catch (err) {
    if (isDbUnavailable(err)) {
      console.warn(
        "[admin-data] getAdminOverview DB unreachable — returning null.",
        (err as { message?: string })?.message
      );
      return null;
    }
    throw err;
  }
}

// ── AI Metrics ────────────────────────────────────────────────────────────────

export interface AiMetricsData {
  period: { days: number; since: string };
  summary: {
    totalCalls: number;
    totalTokens: number;
    acceptanceRate: number | null;
    acceptedCount: number;
    rejectedCount: number;
  };
  byFeature: Array<{ feature: string; calls: number; tokens: number }>;
  daily: Array<{ day: string; calls: number; tokens: number }>;
}

export async function getAiMetrics(days = 30): Promise<AiMetricsData | null> {
  try {
    const safeDays = Math.min(90, Math.max(1, days));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);

    const [byFeature, acceptanceStats, totalTokensAgg, totalCalls, dailyUsage] =
      await Promise.all([
        prisma.aIGenerationLog.groupBy({
          by: ["feature"],
          where: { createdAt: { gte: since } },
          _sum: { tokensUsed: true },
          _count: { id: true },
        }),
        prisma.aIGenerationLog.groupBy({
          by: ["accepted"],
          where: { createdAt: { gte: since }, accepted: { not: null } },
          _count: { id: true },
        }),
        prisma.aIGenerationLog.aggregate({
          where: { createdAt: { gte: since } },
          _sum: { tokensUsed: true },
        }),
        prisma.aIGenerationLog.count({ where: { createdAt: { gte: since } } }),
        prisma.$queryRaw<{ day: Date; calls: bigint; tokens: bigint }[]>`
          SELECT
            date_trunc('day', "createdAt") AS day,
            count(*)::bigint                AS calls,
            COALESCE(sum("tokensUsed"), 0)::bigint AS tokens
          FROM "AIGenerationLog"
          WHERE "createdAt" >= ${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)}
          GROUP BY 1
          ORDER BY 1
        `,
      ]);

    let accepted = 0;
    let rejected = 0;
    for (const row of acceptanceStats) {
      if (row.accepted === true) accepted = row._count.id;
      else if (row.accepted === false) rejected = row._count.id;
    }
    const totalAccepted = accepted + rejected;
    const acceptanceRate =
      totalAccepted > 0 ? Math.round((accepted / totalAccepted) * 100) : null;

    return {
      period: { days: safeDays, since: since.toISOString() },
      summary: {
        totalCalls,
        totalTokens: (totalTokensAgg._sum.tokensUsed as number | null) ?? 0,
        acceptanceRate,
        acceptedCount: accepted,
        rejectedCount: rejected,
      },
      byFeature: byFeature.map((f) => ({
        feature: f.feature,
        calls: f._count.id,
        tokens: (f._sum.tokensUsed as number | null) ?? 0,
      })),
      daily: dailyUsage.map((d) => ({
        day: d.day instanceof Date ? d.day.toISOString() : String(d.day),
        calls: Number(d.calls),
        tokens: Number(d.tokens),
      })),
    };
  } catch (err) {
    if (isDbUnavailable(err)) {
      console.warn(
        "[admin-data] getAiMetrics DB unreachable — returning null.",
        (err as { message?: string })?.message
      );
      return null;
    }
    throw err;
  }
}
