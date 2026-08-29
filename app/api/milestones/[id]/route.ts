import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nullableIsoDateString } from "@/lib/validations/date-schema";

const milestoneStatusEnum = z.preprocess((val) => {
  if (typeof val === "string") {
    const s = val.toLowerCase();
    if (s === "todo" || s === "planned") return "planned";
    if (s === "in_progress" || s === "in-progress" || s === "doing") return "in_progress";
    if (s === "done" || s === "completed") return "completed";
    if (s === "blocked" || s === "delayed") return "delayed";
  }
  return val;
}, z.enum(["planned", "in_progress", "completed", "delayed"]).optional());

const patchSchema = z.object({
  goalId: z.string().nullable().optional(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: milestoneStatusEnum,
  startDate: nullableIsoDateString,
  targetDate: nullableIsoDateString,
  baselineStartDate: nullableIsoDateString,
  baselineTargetDate: nullableIsoDateString,
  dependsOn: z.array(z.string()).nullable().optional(),
  order: z.number().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[milestones/[id] PATCH] Validation failed:", JSON.stringify(parsed.error.format()));
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id },
    include: { goal: { select: { workspaceId: true } } },
  });
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = milestone.goal.workspaceId;

  // Run member check + optional new-goal check in parallel
  const targetGoalId = parsed.data.goalId ?? undefined;
  const [member, newGoal] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    targetGoalId
      ? prisma.goal.findUnique({ where: { id: targetGoalId }, select: { workspaceId: true } })
      : Promise.resolve(null),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (targetGoalId && (!newGoal || newGoal.workspaceId !== workspaceId)) {
    return NextResponse.json({ error: "Invalid goalId" }, { status: 400 });
  }

  const { startDate, targetDate, baselineStartDate, baselineTargetDate, dependsOn, goalId, ...rest } = parsed.data;

  const updateData: Record<string, unknown> = { ...rest };

  if (goalId) {
    updateData.goalId = goalId;
  }
  if (dependsOn !== undefined) {
    updateData.dependsOn = dependsOn ?? [];
  }
  if (startDate !== undefined) {
    updateData.startDate = startDate ? new Date(startDate) : null;
  }
  if (targetDate !== undefined) {
    updateData.targetDate = targetDate ? new Date(targetDate) : null;
  }
  if (baselineStartDate !== undefined) {
    updateData.baselineStartDate = baselineStartDate ? new Date(baselineStartDate) : null;
  }
  if (baselineTargetDate !== undefined) {
    updateData.baselineTargetDate = baselineTargetDate ? new Date(baselineTargetDate) : null;
  }

  const targetTaskStatus = parsed.data.status
    ? parsed.data.status === "completed"
      ? "done"
      : parsed.data.status === "planned"
      ? "todo"
      : parsed.data.status === "in_progress"
      ? "in_progress"
      : parsed.data.status === "delayed"
      ? "blocked"
      : null
    : null;

  if (targetTaskStatus) {
    await prisma.task.updateMany({
      where: { milestoneId: id },
      data: { status: targetTaskStatus },
    });
  }

  const updated = await prisma.milestone.update({
    where: { id },
    data: updateData as never,
    include: { tasks: { orderBy: { order: "asc" } } },
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

  await prisma.milestone.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
