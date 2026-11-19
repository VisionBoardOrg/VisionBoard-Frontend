import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { syncMilestoneStatus } from "@/lib/milestone-sync";
import {
  MAX_TASK_ASSIGNEES,
  assigneesInclude,
  normalizeAssignees,
  setTaskAssignments,
} from "@/lib/task-assignments";

const assigneeSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["owner", "contributor"]),
});

const createSchema = z.object({
  milestoneId: z.string(),
  title: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  assignees: z.array(assigneeSchema).max(MAX_TASK_ASSIGNEES).optional(),
  dueDate: z.string().or(z.date()).optional(),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const milestoneId = searchParams.get("milestoneId");
  const workspaceId = searchParams.get("workspaceId");

  if (!milestoneId && !workspaceId) {
    return NextResponse.json({ error: "milestoneId or workspaceId required" }, { status: 400 });
  }

  let targetWorkspaceId = workspaceId;

  if (milestoneId) {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { goal: { select: { workspaceId: true } } },
    });
    if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    targetWorkspaceId = milestone.goal.workspaceId;
  }

  if (!targetWorkspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: targetWorkspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where: {
      ...(milestoneId ? { milestoneId } : {}),
      // Denormalized workspaceId — avoids the Task→Milestone→Goal join chain
      // on the hot workspace-list path (indexed)
      ...(workspaceId ? { workspaceId } : {}),
    },
    include: { ...assigneesInclude },
    orderBy: { order: "asc" },
    // Hard cap — this endpoint feeds client-side search/boards; callers that
    // need everything must paginate by milestone
    take: 500,
  });

  return NextResponse.json(
    { tasks },
    { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } }
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const milestone = await prisma.milestone.findUnique({
    where: { id: parsed.data.milestoneId },
    include: { goal: { select: { workspaceId: true } } },
  });
  if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });

  const workspaceId = milestone.goal.workspaceId;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Single validation entry point for the "≥1 owner" invariant + membership.
  const normalized = await normalizeAssignees(parsed.data.assignees, workspaceId);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  // Atomic order: get current max order in a single aggregate query rather than
  // count(), which is racy under concurrent creates.
  const maxOrderResult = await prisma.task.aggregate({
    where: { milestoneId: parsed.data.milestoneId },
    _max: { order: true },
  });
  const order = (maxOrderResult._max.order ?? -1) + 1;

  let taskDueDate: Date;
  if (parsed.data.dueDate) {
    const parsedDate = new Date(parsed.data.dueDate);
    taskDueDate = isNaN(parsedDate.getTime())
      ? (milestone.targetDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
      : parsedDate;
  } else {
    taskDueDate = milestone.targetDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  const task = await prisma.task.create({
    data: {
      milestoneId: parsed.data.milestoneId,
      workspaceId,
      title: parsed.data.title,
      priority: parsed.data.priority,
      status: "todo",
      order,
      dueDate: taskDueDate,
    },
  });

  // Route every assignment write through the shared module so notifications and
  // the owner invariant can never drift between callers.
  if (normalized.assignees.length > 0) {
    await setTaskAssignments({
      taskId: task.id,
      workspaceId,
      taskTitle: task.title,
      actorId: session.user.id,
      actorName: session.user.name || "A team member",
      assignees: normalized.assignees,
    });
  }

  // Re-sync parent milestone status (a new todo task must reopen a completed
  // milestone and clear any stale in_progress) — fire-and-forget
  syncMilestoneStatus(parsed.data.milestoneId).catch((err: unknown) =>
    console.error("[tasks POST] Milestone status re-sync failed:", err)
  );

  // Fire-and-forget audit log with the real entityId — non-blocking
  prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "task",
      entityId: task.id,
      action: "created",
    },
  }).catch((err: unknown) => console.error("[tasks POST] Activity log failed:", err));

  const finalTask = await prisma.task.findUnique({
    where: { id: task.id },
    include: { ...assigneesInclude },
  });

  return NextResponse.json({ task: finalTask ?? task }, { status: 201 });
}
