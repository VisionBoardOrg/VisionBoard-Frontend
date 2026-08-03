import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  body: z.string().min(1).max(2000),
  entityType: z.enum(["goal", "milestone", "task", "document"]),
  goalId: z.string().optional(),
  milestoneId: z.string().optional(),
  taskId: z.string().optional(),
  documentId: z.string().optional(),
});

/**
 * Resolve the workspaceId for the entity being commented on.
 * Uses targeted select queries — only fetches the workspaceId field.
 * Returns null if the entity does not exist.
 */
async function resolveWorkspaceId(
  entityType: string,
  goalId?: string,
  milestoneId?: string,
  taskId?: string,
  documentId?: string,
): Promise<string | null> {
  try {
    if (entityType === "goal" && goalId) {
      const goal = await prisma.goal.findUnique({
        where: { id: goalId },
        select: { workspaceId: true },
      });
      return goal?.workspaceId ?? null;
    }
    if (entityType === "milestone" && milestoneId) {
      const ms = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        select: { goal: { select: { workspaceId: true } } },
      });
      return ms?.goal?.workspaceId ?? null;
    }
    if (entityType === "task" && taskId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { milestone: { select: { goal: { select: { workspaceId: true } } } } },
      });
      return task?.milestone?.goal?.workspaceId ?? null;
    }
    if (entityType === "document" && documentId) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { workspaceId: true },
      });
      return doc?.workspaceId ?? null;
    }
  } catch {
    // Swallow — returns null below, treated as 404
  }
  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { entityType, goalId, milestoneId, taskId, documentId } = parsed.data;

  const workspaceId = await resolveWorkspaceId(entityType, goalId, milestoneId, taskId, documentId);
  if (!workspaceId) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Create comment + activity log in a single transaction
  const [comment] = await prisma.$transaction([
    prisma.comment.create({
      data: {
        body: parsed.data.body,
        authorId: session.user.id,
        entityType: parsed.data.entityType,
        goalId: goalId ?? null,
        milestoneId: milestoneId ?? null,
        taskId: taskId ?? null,
        documentId: documentId ?? null,
      },
      include: { author: { select: { id: true, name: true, image: true } } },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        entityType,
        entityId: goalId ?? milestoneId ?? taskId ?? documentId ?? "unknown",
        action: "commented",
      },
    }),
  ]);

  return NextResponse.json({ comment }, { status: 201 });
}
