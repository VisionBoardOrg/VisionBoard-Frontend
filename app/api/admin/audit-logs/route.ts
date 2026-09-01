import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const entityType = searchParams.get("entityType") ?? "";
  const workspaceId = searchParams.get("workspaceId") ?? "";
  const q = searchParams.get("q")?.trim() ?? "";

  try {
    const where = {
      ...(entityType ? { entityType } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(q
        ? {
            OR: [
              { action: { contains: q, mode: "insensitive" as const } },
              { entityType: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          workspace: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[api/admin/audit-logs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
