import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { resolveMentions } from "@/lib/mentions";
import {
  dispatchMentionNotification,
  dispatchCommentNotification,
} from "@/lib/notifications";

const createSchema = z.object({
  body: z.string().min(1).max(2000),
  entityType: z.enum(["goal", "milestone", "task", "document"]),
  goalId: z.string().optional(),
  milestoneId: z.string().optional(),
  taskId: z.string().optional(),
  documentId: z.string().optional(),
}).refine(
  (data) => data.goalId || data.milestoneId || data.taskId || data.documentId,
  {
    message: "At least one entity reference is required (goalId, milestoneId, taskId, or documentId)",
    // Point at the first entity field so the error is easy to surface in client validation
    path: ["goalId"],
  }
);

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

  // Resolve any @mentions present in the comment body
  const mentions = await resolveMentions(parsed.data.body, workspaceId);
  const mentionedUserIds = mentions.map((m) => m.user.id);
  const entityId = goalId ?? milestoneId ?? taskId ?? documentId;
  // The .refine() on createSchema guarantees at least one of these is set,
  // so entityId will never be undefined here.  The non-null assertion is safe.
  const resolvedEntityId = entityId!;

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
        entityId: resolvedEntityId,
        action: "commented",
        diff: {
          mentionedUserIds,
          mentionsCount: mentions.length,
          handles: mentions.map((m) => m.handle),
        },
      },
    }),
  ]);

  // Dispatch real-time and persistent notifications (fire-and-forget)
  const authorName = session.user.name || "A team member";

  // 1. Mention notifications
  if (mentionedUserIds.length > 0) {
    dispatchMentionNotification({
      mentionedUserIds,
      authorId: session.user.id,
      authorName,
      workspaceId,
      entityType: parsed.data.entityType,
      entityId: resolvedEntityId,
      commentBody: parsed.data.body,
    }).catch((err) => console.error("[comments/route] Mention notification failed:", err));
  }

  // 2. Entity owner/assignee comment notification
  (async () => {
    try {
      let targetUserId: string | null = null;
      let entityTitle: string | undefined;

      if (entityType === "task" && taskId) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { assigneeId: true, title: true },
        });
        targetUserId = task?.assigneeId ?? null;
        entityTitle = task?.title;
      } else if (entityType === "goal" && goalId) {
        const goal = await prisma.goal.findUnique({
          where: { id: goalId },
          select: { ownerId: true, title: true },
        });
        targetUserId = goal?.ownerId ?? null;
        entityTitle = goal?.title;
      } else if (entityType === "document" && documentId) {
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
          select: { authorId: true, title: true },
        });
        targetUserId = doc?.authorId ?? null;
        entityTitle = doc?.title;
      }

      if (targetUserId && targetUserId !== session.user.id && !mentionedUserIds.includes(targetUserId)) {
        await dispatchCommentNotification({
          targetUserId,
          authorId: session.user.id,
          authorName,
          workspaceId,
          entityType: parsed.data.entityType,
          entityId: resolvedEntityId,
          entityTitle,
          commentBody: parsed.data.body,
        });
      }
    } catch (err) {
      console.error("[comments/route] Comment notification failed:", err);
    }
  })();

  return NextResponse.json({ comment, mentions }, { status: 201 });
}
