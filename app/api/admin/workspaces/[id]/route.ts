import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, plan: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        goals: {
          select: {
            id: true,
            title: true,
            status: true,
            healthScore: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        invites: {
          where: { status: "pending" },
          select: { id: true, email: true, role: true, expiresAt: true },
        },
        _count: {
          select: {
            members: true,
            goals: true,
            tasks: true,
            documents: true,
            boardItems: true,
            activityLogs: true,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json({
      workspace: {
        ...workspace,
        storageUsedBytes: workspace.storageUsedBytes.toString(),
      },
    });
  } catch (error) {
    console.error("[api/admin/workspaces/[id]]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
