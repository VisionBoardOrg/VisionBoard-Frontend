import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { calculateGoalHealth } from "@/lib/goal-health";
import { syncMilestoneStatus } from "@/lib/milestone-sync";
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const userIdsToCheck = [session.user.id];
  if (parsed.data.assigneeId) userIdsToCheck.push(parsed.data.assigneeId);

  // Single consolidated query: fetch task, milestone goal, and workspace memberships in 1 SQL round-trip
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      milestone: {
        select: {
          id: true,
          status: true,
          goalId: true,
          goal: { select: { workspaceId: true } },
        },
      },
      workspace: {
        select: {
          id: true,
          members: {
            where: { userId: { in: userIdsToCheck } },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = task.workspaceId || task.milestone.goal.workspaceId;
  const goalId = task.milestone.goalId;

  const currentMember = task.workspace?.members.find((m) => m.userId === session.user.id);
  if (!currentMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (parsed.data.assigneeId) {
    const hasAssignee = task.workspace?.members.some((m) => m.userId === parsed.data.assigneeId);
    if (!hasAssignee) {
      return NextResponse.json({ error: "Assignee is not a member of this workspace" }, { status: 400 });
    }
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

  // Offload auxiliary updates to Next.js after() — response is returned immediately to client,
  // and tasks are guaranteed to complete without serverless process freezing
  after(async () => {
    // 1. Auto-sync milestone status; only recalculate full goal health if milestone status actually changed
    if (parsed.data.status && task.milestoneId) {
      try {
        const newMilestoneStatus = await syncMilestoneStatus(task.milestoneId);
        if (newMilestoneStatus && newMilestoneStatus !== task.milestone.status && goalId) {
          await calculateGoalHealth(goalId).catch(() => {});
        }
      } catch (err) {
        console.error("[tasks/[id] PATCH] Auto milestone update failed:", err);
      }
    }

    // 2. Audit log
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

    // 3. Dispatch notifications
    const userName = session.user.name || "A team member";

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
  });

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

  // Re-sync parent milestone status (deleting the only started task should
  // move it back to planned) — fire-and-forget
  if (task.milestoneId) {
    syncMilestoneStatus(task.milestoneId).catch((err: unknown) =>
      console.error("[tasks/[id] DELETE] Milestone status re-sync failed:", err)
    );
  }
  return NextResponse.json({ success: true });
}
