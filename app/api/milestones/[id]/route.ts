import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  goalId: z.string().optional(),
  title: z.string().min(1).optional(),
  status: z.enum(["planned", "in_progress", "completed", "delayed"]).optional(),
  targetDate: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
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

  // Verify milestone belongs to a workspace the user is a member of
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

  // If goalId is being changed, verify new goal belongs to same workspace
  if (parsed.data.goalId) {
    const newGoal = await prisma.goal.findUnique({ where: { id: parsed.data.goalId } });
    if (!newGoal || newGoal.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Invalid goalId" }, { status: 400 });
    }
  }

  const { targetDate, ...rest } = parsed.data;
  const updated = await prisma.milestone.update({
    where: { id },
    data: {
      ...rest,
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "milestone",
      entityId: id,
      action: "updated",
      diff: parsed.data as never,
    },
  });

  return NextResponse.json({ milestone: updated });
}
