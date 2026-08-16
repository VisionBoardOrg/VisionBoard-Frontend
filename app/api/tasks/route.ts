import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { dispatchTaskAssignmentNotification } from "@/lib/notifications";

const createSchema = z.object({
  milestoneId: z.string(),
  title: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  assigneeId: z.string().nullable().optional(),
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
      ...(workspaceId ? { milestone: { goal: { workspaceId } } } : {}),
    },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ tasks });
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

  // Validate membership + assignee membership in parallel
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
      title: parsed.data.title,
      priority: parsed.data.priority,
      assigneeId: parsed.data.assigneeId ?? null,
      status: "todo",
      order,
      dueDate: taskDueDate,
    },
  });

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

  // If assigned to another user, dispatch task assignment notification
  if (parsed.data.assigneeId && parsed.data.assigneeId !== session.user.id) {
    dispatchTaskAssignmentNotification({
      assigneeId: parsed.data.assigneeId,
      assignerId: session.user.id,
      assignerName: session.user.name || "A team member",
      taskId: task.id,
      taskTitle: task.title,
      workspaceId,
    }).catch((err) => console.error("[tasks POST] Task assignment notification failed:", err));
  }

  return NextResponse.json({ task }, { status: 201 });
}
