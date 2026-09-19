import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const subWhere = {
      stripeSubscriptionId: { not: null },
      plan: { not: "free" as const },
    };

    const [
      planBreakdown,
      activeSubscriptions,
      cancellingThisPeriod,
      newSubscribersLast30d,
      paidSubsCount,
      recentSubscriptions,
    ] = await Promise.all([
      // Plan distribution
      prisma.user.groupBy({
        by: ["plan"],
        _count: { plan: true },
      }),
      // Active paid subscriptions
      prisma.user.count({
        where: subWhere,
      }),
      // Cancelling at period end
      prisma.user.count({
        where: { stripeCancelAtPeriodEnd: true },
      }),
      // New paid subscribers last 30 days
      prisma.user.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          ...subWhere,
        },
      }),
      // Total paid subscriptions (for pagination)
      prisma.user.count({ where: subWhere }),
      // Recent subscriptions, paginated
      prisma.user.findMany({
        where: subWhere,
        select: {
          id: true,
          name: true,
          email: true,
          plan: true,
          stripePriceId: true,
          stripeCurrentPeriodEnd: true,
          stripeCancelAtPeriodEnd: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const planMap: Record<string, number> = {};
    for (const p of planBreakdown) {
      planMap[p.plan] = p._count.plan;
    }

    return NextResponse.json({
      summary: {
        activeSubscriptions,
        cancellingThisPeriod,
        newSubscribersLast30d,
        freeUsers: planMap.free ?? 0,
      },
      planBreakdown: planMap,
      recentSubscriptions,
      subscriptionsPagination: {
        page,
        limit,
        total: paidSubsCount,
        totalPages: Math.ceil(paidSubsCount / limit),
      },
    });
  } catch (error) {
    console.error("[api/admin/billing]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
