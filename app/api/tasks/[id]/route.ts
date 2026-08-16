import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateGoalHealth } from "@/lib/goal-health";
import {
  dispatchTaskAssignmentNotification,
  dispatchTaskBlockedNotification,
} from "@/lib/notifications";

const patchSchema = z.object({
  assigneeId: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  title: z.string().min(1).optional(),
  dueDate: z.string().or(z.date()).optional(),
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
    include: { milestone: { select: { goalId: true, goal: { select: { workspaceId: true } } } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = task.milestone.goal.workspaceId;
  const goalId = task.milestone.goalId;

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
  if (parsed.data.dueDate) {
    const parsedDate = new Date(parsed.data.dueDate);
    if (!isNaN(parsedDate.getTime())) {
      updateData.dueDate = parsedDate;
    } else {
      delete updateData.dueDate;
    }
  }
  if (parsed.data.status && parsed.data.status !== "blocked" && !("blockedReason" in parsed.data)) {
    updateData.blockedReason = null;
  }

  const updated = await prisma.task.update({ where: { id }, data: updateData as never });

  // Auto-sync parent milestone status based on task completion status
  if (parsed.data.status && task.milestoneId) {
    const milestoneTasks = await prisma.task.findMany({
      where: { milestoneId: task.milestoneId },
      select: { status: true },
    });
    if (milestoneTasks.length > 0) {
      const allDone = milestoneTasks.every((t) => t.status === "done");
      const anyStarted = milestoneTasks.some((t) => t.status === "done" || t.status === "in_progress" || t.status === "in_review");
      const targetMilestoneStatus = allDone ? "completed" : anyStarted ? "in_progress" : "planned";

      prisma.milestone.update({
        where: { id: task.milestoneId },
        data: { status: targetMilestoneStatus },
      })
        .then(() => {
          if (goalId) {
            calculateGoalHealth(goalId).catch((err) =>
              console.error("[tasks/[id] PATCH] Auto goal health calculation failed:", err)
            );
          }
        })
        .catch((err: unknown) => console.error("[tasks/[id] PATCH] Auto milestone update failed:", err));
    }
  } else if (goalId && (parsed.data.status || parsed.data.priority)) {
    calculateGoalHealth(goalId).catch((err) =>
      console.error("[tasks/[id] PATCH] Auto goal health calculation failed:", err)
    );
  }

  // Fire-and-forget audit log — non-blocking
  prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "task",
      entityId: id,
      action: "updated",
      diff: parsed.data as never,
    },
  }).catch((err: unknown) => console.error("[tasks/[id] PATCH] Activity log failed:", err));

  // Dispatch real-time & persistent notifications
  const userName = session.user.name || "A team member";

  // 1. Task assignment notification
  if (parsed.data.assigneeId && parsed.data.assigneeId !== task.assigneeId) {
    dispatchTaskAssignmentNotification({
      assigneeId: parsed.data.assigneeId,
      assignerId: session.user.id,
      assignerName: userName,
      taskId: id,
      taskTitle: updated.title,
      workspaceId,
    }).catch((err) => console.error("[tasks/[id] PATCH] Task assignment notification failed:", err));
  }

  // 2. Task blocked notification to PMs/admins
  if (parsed.data.status === "blocked" && task.status !== "blocked") {
    dispatchTaskBlockedNotification({
      taskId: id,
      taskTitle: updated.title,
      blockedReason: parsed.data.blockedReason,
      workspaceId,
      updaterId: session.user.id,
      updaterName: userName,
    }).catch((err) => console.error("[tasks/[id] PATCH] Task blocked notification failed:", err));
  }

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
