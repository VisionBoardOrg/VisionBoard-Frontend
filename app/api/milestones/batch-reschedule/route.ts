import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nullableIsoDateString } from "@/lib/validations/date-schema";

const shiftItemSchema = z.object({
  milestoneId: z.string(),
  startDate: nullableIsoDateString,
  targetDate: nullableIsoDateString,
});

const batchRescheduleSchema = z.object({
  workspaceId: z.string(),
  shifts: z.array(shiftItemSchema).min(1).max(100),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = batchRescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  const { workspaceId, shifts } = parsed.data;

  // Verify membership
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify all milestones belong to the workspace
  const milestoneIds = shifts.map((s) => s.milestoneId);
  const foundMilestones = await prisma.milestone.findMany({
    where: {
      id: { in: milestoneIds },
      goal: { workspaceId },
    },
    select: { id: true },
  });

  if (foundMilestones.length !== milestoneIds.length) {
    return NextResponse.json({ error: "One or more milestones not found in this workspace" }, { status: 400 });
  }

  // Atomic batch updates
  const updatePromises = shifts.map((shift) =>
    prisma.milestone.update({
      where: { id: shift.milestoneId },
      data: {
        ...(shift.startDate !== undefined ? { startDate: shift.startDate ? new Date(shift.startDate) : null } : {}),
        ...(shift.targetDate !== undefined ? { targetDate: shift.targetDate ? new Date(shift.targetDate) : null } : {}),
      },
    })
  );

  const updatedMilestones = await prisma.$transaction(updatePromises);

  // Log activity
  prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "milestones",
      entityId: "batch",
      action: "batch_rescheduled",
      diff: { count: shifts.length, milestoneIds } as never,
    },
  }).catch((err: unknown) => console.error("[batch-reschedule] Activity log failed:", err));

  return NextResponse.json({ success: true, updatedCount: updatedMilestones.length });
}
