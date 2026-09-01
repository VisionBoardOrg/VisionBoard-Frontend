import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

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

    return NextResponse.json({
      kpis: {
        totalUsers,
        newUsersLast30d,
        newUsersLast7d,
        totalWorkspaces,
        totalTasks,
        totalGoals,
        activeSubscriptions,
        scheduledDeletions,
        aiTokensLast30d: aiUsageLast30d._sum.tokensUsed ?? 0,
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
    });
  } catch (error) {
    console.error("[api/admin/overview]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
