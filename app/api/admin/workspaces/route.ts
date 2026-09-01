import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const q = searchParams.get("q")?.trim() ?? "";

  try {
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          storageUsedBytes: true,
          owner: { select: { id: true, name: true, email: true, plan: true } },
          _count: {
            select: {
              members: true,
              goals: true,
              tasks: true,
              documents: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.workspace.count({ where }),
    ]);

    return NextResponse.json({
      workspaces: workspaces.map((ws) => ({
        ...ws,
        storageUsedBytes: ws.storageUsedBytes.toString(), // BigInt → string for JSON
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("[api/admin/workspaces]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
