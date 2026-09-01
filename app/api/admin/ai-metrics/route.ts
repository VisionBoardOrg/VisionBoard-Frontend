import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [
      byFeature,
      acceptanceStats,
      totalTokens,
      totalCalls,
      dailyUsage,
    ] = await Promise.all([
      // Tokens + calls grouped by feature
      prisma.aIGenerationLog.groupBy({
        by: ["feature"],
        where: { createdAt: { gte: since } },
        _sum: { tokensUsed: true },
        _count: { id: true },
      }),
      // Acceptance rate
      prisma.aIGenerationLog.groupBy({
        by: ["accepted"],
        where: { createdAt: { gte: since }, accepted: { not: null } },
        _count: { id: true },
      }),
      // Total tokens
      prisma.aIGenerationLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { tokensUsed: true },
      }),
      // Total calls
      prisma.aIGenerationLog.count({ where: { createdAt: { gte: since } } }),
      // Daily usage for sparkline (last 14 days)
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

    // Acceptance rate calculation
    let accepted = 0;
    let rejected = 0;
    for (const row of acceptanceStats) {
      if (row.accepted === true) accepted = row._count.id;
      else if (row.accepted === false) rejected = row._count.id;
    }
    const total = accepted + rejected;
    const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : null;

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      summary: {
        totalCalls,
        totalTokens: totalTokens._sum.tokensUsed ?? 0,
        acceptanceRate,
        acceptedCount: accepted,
        rejectedCount: rejected,
      },
      byFeature: byFeature.map((f) => ({
        feature: f.feature,
        calls: f._count.id,
        tokens: f._sum.tokensUsed ?? 0,
      })),
      daily: dailyUsage.map((d) => ({
        day: d.day,
        calls: Number(d.calls),
        tokens: Number(d.tokens),
      })),
    });
  } catch (error) {
    console.error("[api/admin/ai-metrics]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
