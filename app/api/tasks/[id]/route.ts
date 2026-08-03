import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  assigneeId: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  title: z.string().min(1).optional(),
  blockedReason: z.string().max(500).nullable().optional(),
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

  const task = await prisma.task.findUnique({
    where: { id },
    include: { milestone: { select: { goal: { select: { workspaceId: true } } } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = task.milestone.goal.workspaceId;

  // Run membership check + optional assignee check in parallel
  const [member, assigneeMember] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    parsed.data.assigneeId
      ? prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: parsed.data.assigneeId } },
        })
      : Promise.resolve(null),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (parsed.data.assigneeId && !assigneeMember) {
    return NextResponse.json({ error: "Assignee is not a member of this workspace" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status && parsed.data.status !== "blocked" && !("blockedReason" in parsed.data)) {
    updateData.blockedReason = null;
  }

  const [updated] = await prisma.$transaction([
    prisma.task.update({ where: { id }, data: updateData as never }),
    prisma.activityLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        entityType: "task",
        entityId: id,
        action: "updated",
        diff: parsed.data as never,
      },
    }),
  ]);

  return NextResponse.json({ task: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: { milestone: { select: { goal: { select: { workspaceId: true } } } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = task.milestone.goal.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member || (member.role !== "admin" && member.role !== "pm")) {
    return NextResponse.json({ error: "Only admins and PMs can delete tasks." }, { status: 403 });
  }

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
