import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nullableIsoDateString } from "@/lib/validations/date-schema";

const patchSchema = z.object({
  goalId: z.string().optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["planned", "in_progress", "completed", "delayed"]).optional(),
  targetDate: nullableIsoDateString,
});

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

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { goal: { select: { workspaceId: true } } },
  });
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = milestone.goal.workspaceId;

  // Run member check + optional new-goal check in parallel
  const [member, newGoal] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    parsed.data.goalId
      ? prisma.goal.findUnique({ where: { id: parsed.data.goalId }, select: { workspaceId: true } })
      : Promise.resolve(null),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parsed.data.goalId && (!newGoal || newGoal.workspaceId !== workspaceId)) {
    return NextResponse.json({ error: "Invalid goalId" }, { status: 400 });
  }

  const { targetDate, ...rest } = parsed.data;

  const updated = await prisma.milestone.update({
    where: { id },
    data: {
      ...rest,
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
    },
  });

  // Fire-and-forget audit log — non-blocking
  prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "milestone",
      entityId: id,
      action: "updated",
      diff: parsed.data as never,
    },
  }).catch((err: unknown) => console.error("[milestones/[id] PATCH] Activity log failed:", err));

  return NextResponse.json({ milestone: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { goal: { select: { workspaceId: true } } },
  });
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = milestone.goal.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (member.role !== "admin" && member.role !== "pm") {
    return NextResponse.json({ error: "Only admins and PMs can delete milestones" }, { status: 403 });
  }

  await prisma.milestone.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
