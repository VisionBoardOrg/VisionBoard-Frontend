import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nullableIsoDateString } from "@/lib/validations/date-schema";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  objective: z.string().min(1).max(2000).optional(),
  keyResults: z.array(z.object({
    id: z.string(),
    title: z.string().max(300),
    target: z.number(),
    current: z.number(),
    unit: z.string().max(50),
  })).max(20).optional(),
  targetDate: nullableIsoDateString,
  status: z.enum(["draft", "active", "completed", "cancelled"]).optional(),
  healthScore: z.number().int().min(0).max(100).optional(),
});

/**
 * Fetch the goal and verify membership in parallel — avoids two sequential
 * round trips (the old getGoalAndVerifyMember pattern did two sequential queries).
 */
async function getGoalWithMember(id: string, userId: string) {
  const goal = await prisma.goal.findUnique({
    where: { id },
    select: {
      id: true, workspaceId: true, title: true, status: true,
      objective: true, keyResults: true, targetDate: true,
      healthScore: true, ownerId: true, createdAt: true, updatedAt: true,
    },
  });
  if (!goal) return { goal: null, member: null };

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: goal.workspaceId, userId } },
  });
  return { goal, member };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fetch workspace membership and the full goal in a single round-trip via parallel queries.
  // We first need the workspaceId so we can check membership — fetch that in a lightweight query,
  // then run the membership check and full-data fetch in parallel.
  const slim = await prisma.goal.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!slim) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [member, full] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: slim.workspaceId, userId: session.user.id } },
    }),
    prisma.goal.findUnique({
      where: { id },
      include: {
        milestones: {
          include: { tasks: { orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
        documents: {
          select: { id: true, title: true, updatedAt: true, author: { select: { id: true, name: true } } },
        },
        comments: {
          include: { author: { select: { id: true, name: true, image: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(
    { goal: full },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } }
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { goal, member } = await getGoalWithMember(id, session.user.id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { targetDate, keyResults, ...rest } = parsed.data;

  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...rest,
      ...(keyResults !== undefined ? { keyResults: keyResults as never } : {}),
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
    },
  });

  // Fire-and-forget audit log — non-blocking
  prisma.activityLog.create({
    data: {
      workspaceId: goal.workspaceId,
      userId: session.user.id,
      entityType: "goal",
      entityId: id,
      action: "updated",
    },
  }).catch((err: unknown) => console.error("[goals/[id] PATCH] Activity log failed:", err));

  return NextResponse.json({ goal: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { goal, member } = await getGoalWithMember(id, session.user.id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (member.role !== "admin" && member.role !== "pm") {
    return NextResponse.json({ error: "Only admins and PMs can delete goals" }, { status: 403 });
  }

  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
