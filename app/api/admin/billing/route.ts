import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      planBreakdown,
      activeSubscriptions,
      cancellingThisPeriod,
      newSubscribersLast30d,
      recentSubscriptions,
    ] = await Promise.all([
      // Plan distribution
      prisma.user.groupBy({
        by: ["plan"],
        _count: { plan: true },
      }),
      // Active paid subscriptions
      prisma.user.count({
        where: {
          stripeSubscriptionId: { not: null },
          plan: { not: "free" },
        },
      }),
      // Cancelling at period end
      prisma.user.count({
        where: { stripeCancelAtPeriodEnd: true },
      }),
      // New paid subscribers last 30 days
      prisma.user.count({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          plan: { not: "free" },
          stripeSubscriptionId: { not: null },
        },
      }),
      // Recent subscriptions
      prisma.user.findMany({
        where: {
          stripeSubscriptionId: { not: null },
          plan: { not: "free" },
        },
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
        take: 50,
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
    });
  } catch (error) {
    console.error("[api/admin/billing]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
