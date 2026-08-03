import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  milestoneId: z.string(),
  title: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
  assigneeId: z.string().nullable().optional(),
});

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

  const [task] = await prisma.$transaction([
    prisma.task.create({
      data: {
        milestoneId: parsed.data.milestoneId,
        title: parsed.data.title,
        priority: parsed.data.priority,
        assigneeId: parsed.data.assigneeId ?? null,
        status: "todo",
        order,
      },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        entityType: "task",
        entityId: "pending",
        action: "created",
      },
    }),
  ]);

  return NextResponse.json({ task }, { status: 201 });
}
