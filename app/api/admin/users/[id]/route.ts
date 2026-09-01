import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  plan: z.enum(["free", "startup", "growth", "enterprise"]).optional(),
  aiCreditsUsed: z.number().int().min(0).optional(),
  scheduledDeletion: z.string().nullable().optional(), // ISO date string or null to cancel
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        ownedWorkspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            _count: { select: { members: true, goals: true, tasks: true } },
          },
        },
        memberships: {
          include: {
            workspace: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: {
          select: {
            sessions: true,
            aiLogs: true,
            comments: true,
            documents: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Strip sensitive fields
    const { hashedPassword: _, ...safeUser } = user as typeof user & { hashedPassword?: string };

    return NextResponse.json({ user: safeUser });
  } catch (error) {
    console.error("[api/admin/users/[id] GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { plan, aiCreditsUsed, scheduledDeletion } = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (plan !== undefined) updateData.plan = plan;
    if (aiCreditsUsed !== undefined) updateData.aiCreditsUsed = aiCreditsUsed;
    if (scheduledDeletion !== undefined) {
      updateData.scheduledDeletion = scheduledDeletion ? new Date(scheduledDeletion) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        aiCreditsUsed: true,
        scheduledDeletion: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, user });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("[api/admin/users/[id] PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
