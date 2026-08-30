import { prisma } from "@/lib/prisma";
import { emitLiveNotification } from "@/lib/notification-events";
import { Prisma, type NotificationType } from "@prisma/client";

export interface CreateNotificationInput {
  userId: string;
  workspaceId?: string | null;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: "task" | "goal" | "milestone" | "document" | "workspace" | "billing" | string | null;
  entityId?: string | null;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface NotificationResponseItem {
  id: string;
  userId: string;
  workspaceId: string | null;
  actorId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  link: string | null;
  read: boolean;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
  } | null;
  workspace?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

/**
 * Base method to create a single notification and emit it to active SSE streams.
 */
export async function createNotification(input: CreateNotificationInput) {
  // Prevent notifying oneself (if actor is the same as recipient)
  if (input.actorId && input.actorId === input.userId) {
    return null;
  }

  try {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId ?? null,
        actorId: input.actorId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        link: input.link ?? null,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
      include: {
        actor: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    // Emit live event to SSE subscribers (fire-and-forget — async, non-blocking)
    emitLiveNotification({
      id: notification.id,
      userId: notification.userId,
      workspaceId: notification.workspaceId,
      actorId: notification.actorId,
      actorName: notification.actor?.name,
      actorImage: notification.actor?.image,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      link: notification.link,
      read: notification.read,
      metadata: notification.metadata as Record<string, unknown> | null,
      createdAt: notification.createdAt.toISOString(),
    }).catch((err) => console.error("[notifications] SSE emit failed:", err));

    return notification;
  } catch (err) {
    console.error("[notifications] Failed to create notification:", err);
    return null;
  }
}

/**
 * Batch insert multiple notifications for multiple recipients.
 */
export async function createBulkNotifications(inputs: CreateNotificationInput[]) {
  const filtered = inputs.filter((i) => !i.actorId || i.actorId !== i.userId);
  if (filtered.length === 0) return [];

  const results = await Promise.allSettled(
    filtered.map((input) => createNotification(input))
  );

  const createdNotifications = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      createdNotifications.push(r.value);
    }
  }

  return createdNotifications;
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGHER-LEVEL DOMAIN DISPATCHERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. Dispatch @Mention notifications in comments/discussions
 */
export async function dispatchMentionNotification(params: {
  mentionedUserIds: string[];
  authorId: string;
  authorName: string;
  workspaceId: string;
  entityType: "goal" | "milestone" | "task" | "document";
  entityId: string;
  entityTitle?: string;
  commentBody: string;
}) {
  const {
    mentionedUserIds,
    authorId,
    authorName,
    workspaceId,
    entityType,
    entityId,
    entityTitle,
    commentBody,
  } = params;

  if (mentionedUserIds.length === 0) return;

  const snippet =
    commentBody.length > 100 ? `${commentBody.slice(0, 100)}…` : commentBody;

  let link = `/workspace/${workspaceId}/workspace`;
  if (entityType === "task") link = `/workspace/${workspaceId}/tasks?taskId=${entityId}`;
  else if (entityType === "goal") link = `/workspace/${workspaceId}/goals?goalId=${entityId}`;
  else if (entityType === "milestone") link = `/workspace/${workspaceId}/board`;
  else if (entityType === "document") link = `/workspace/${workspaceId}/docs/${entityId}`;

  const label = entityTitle ? `"${entityTitle}"` : `a ${entityType}`;

  const inputs: CreateNotificationInput[] = mentionedUserIds.map((userId) => ({
    userId,
    workspaceId,
    actorId: authorId,
    type: "comment_mention",
    title: `${authorName} mentioned you`,
    message: `${authorName} mentioned you in a comment on ${label}: "${snippet}"`,
    entityType,
    entityId,
    link,
    metadata: { commentSnippet: snippet, entityTitle },
  }));

  return createBulkNotifications(inputs);
}

/**
 * 2. Dispatch Comment Created notification for the owner/assignee of the item
 */
export async function dispatchCommentNotification(params: {
  targetUserId: string;
  authorId: string;
  authorName: string;
  workspaceId: string;
  entityType: "goal" | "milestone" | "task" | "document";
  entityId: string;
  entityTitle?: string;
  commentBody: string;
}) {
  const {
    targetUserId,
    authorId,
    authorName,
    workspaceId,
    entityType,
    entityId,
    entityTitle,
    commentBody,
  } = params;

  if (targetUserId === authorId) return;

  const snippet =
    commentBody.length > 100 ? `${commentBody.slice(0, 100)}…` : commentBody;

  let link = `/workspace/${workspaceId}/workspace`;
  if (entityType === "task") link = `/workspace/${workspaceId}/tasks?taskId=${entityId}`;
  else if (entityType === "goal") link = `/workspace/${workspaceId}/goals?goalId=${entityId}`;
  else if (entityType === "milestone") link = `/workspace/${workspaceId}/board`;
  else if (entityType === "document") link = `/workspace/${workspaceId}/docs/${entityId}`;

  const label = entityTitle ? `"${entityTitle}"` : `your ${entityType}`;

  return createNotification({
    userId: targetUserId,
    workspaceId,
    actorId: authorId,
    type: "comment_created",
    title: `New comment on ${label}`,
    message: `${authorName} commented: "${snippet}"`,
    entityType,
    entityId,
    link,
    metadata: { commentSnippet: snippet, entityTitle },
  });
}

/**
 * 3. Dispatch Task Assignment notification
 */
export async function dispatchTaskAssignmentNotification(params: {
  assigneeId: string;
  assignerId: string;
  assignerName: string;
  taskId: string;
  taskTitle: string;
  workspaceId: string;
}) {
  const { assigneeId, assignerId, assignerName, taskId, taskTitle, workspaceId } = params;
  if (assigneeId === assignerId) return;

  return createNotification({
    userId: assigneeId,
    workspaceId,
    actorId: assignerId,
    type: "task_assigned",
    title: "New task assigned to you",
    message: `${assignerName} assigned you to "${taskTitle}".`,
    entityType: "task",
    entityId: taskId,
    link: `/workspace/${workspaceId}/tasks?taskId=${taskId}`,
    metadata: { taskId, taskTitle },
  });
}

/**
 * 4. Dispatch Task Blocked notification to Workspace PMs & Admins
 */
export async function dispatchTaskBlockedNotification(params: {
  taskId: string;
  taskTitle: string;
  blockedReason?: string | null;
  workspaceId: string;
  updaterId: string;
  updaterName: string;
}) {
  const { taskId, taskTitle, blockedReason, workspaceId, updaterId, updaterName } = params;

  // Find workspace PMs and Admins
  const pmsAndAdmins = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      role: { in: ["admin", "pm"] },
      userId: { not: updaterId },
    },
    select: { userId: true },
  });

  const reasonText = blockedReason ? ` Reason: ${blockedReason}` : "";

  const inputs: CreateNotificationInput[] = pmsAndAdmins.map((m) => ({
    userId: m.userId,
    workspaceId,
    actorId: updaterId,
    type: "task_blocked",
    title: `Task Blocked: ${taskTitle}`,
    message: `${updaterName} marked "${taskTitle}" as blocked.${reasonText}`,
    entityType: "task",
    entityId: taskId,
    link: `/workspace/${workspaceId}/tasks?taskId=${taskId}`,
    metadata: { taskId, taskTitle, blockedReason },
  }));

  return createBulkNotifications(inputs);
}

/**
 * 5. Dispatch Task Due Soon / Overdue notifications (Triggered by Sweeper)
 */
export async function dispatchTaskDueAlert(params: {
  taskId: string;
  taskTitle: string;
  dueDate: Date;
  assigneeId: string;
  workspaceId: string;
  isOverdue: boolean;
}) {
  const { taskId, taskTitle, dueDate, assigneeId, workspaceId, isOverdue } = params;

  const dateStr = dueDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const type: NotificationType = isOverdue ? "task_overdue" : "task_due_soon";
  const title = isOverdue
    ? `Task Overdue: ${taskTitle}`
    : `Task Due Soon: ${taskTitle}`;
  const message = isOverdue
    ? `"${taskTitle}" was due on ${dateStr} and remains incomplete.`
    : `"${taskTitle}" is due on ${dateStr}.`;

  return createNotification({
    userId: assigneeId,
    workspaceId,
    actorId: null,
    type,
    title,
    message,
    entityType: "task",
    entityId: taskId,
    link: `/workspace/${workspaceId}/tasks?taskId=${taskId}`,
    metadata: { taskId, taskTitle, dueDate: dueDate.toISOString(), isOverdue },
  });
}

/**
 * 6. Dispatch Milestone Delayed notification (Triggered by Sweeper)
 *
 * Single-milestone variant — fetches goal owner + workspace admins in a
 * single parallel query rather than two sequential round-trips.
 */
export async function dispatchMilestoneDelayedNotification(params: {
  milestoneId: string;
  milestoneTitle: string;
  targetDate?: Date | null;
  goalId: string;
  goalTitle?: string;
  workspaceId: string;
}) {
  const { milestoneId, milestoneTitle, targetDate, goalId, goalTitle, workspaceId } = params;

  // F-11: fetch goal owner + workspace admins in parallel (was 2 sequential queries)
  const [goal, admins] = await Promise.all([
    prisma.goal.findUnique({ where: { id: goalId }, select: { ownerId: true } }),
    prisma.workspaceMember.findMany({
      where: { workspaceId, role: { in: ["admin", "pm"] } },
      select: { userId: true },
    }),
  ]);

  const recipients = new Set<string>();
  if (goal?.ownerId) recipients.add(goal.ownerId);
  admins.forEach((a) => recipients.add(a.userId));

  const targetDateStr = targetDate ? ` (target was ${targetDate.toLocaleDateString()})` : "";

  const inputs: CreateNotificationInput[] = Array.from(recipients).map((userId) => ({
    userId,
    workspaceId,
    actorId: null,
    type: "milestone_delayed" as NotificationType,
    title: `Milestone Delayed: ${milestoneTitle}`,
    message: `Milestone "${milestoneTitle}"${targetDateStr} under goal "${goalTitle || "Goal"}" has elapsed without completion.`,
    entityType: "milestone",
    entityId: milestoneId,
    link: `/workspace/${workspaceId}/goals?goalId=${goalId}`,
    metadata: { milestoneId, milestoneTitle, goalId },
  }));

  return createBulkNotifications(inputs);
}

/**
 * 7. Dispatch Goal At Risk / Health Degraded notification
 */
export async function dispatchGoalHealthNotification(params: {
  goalId: string;
  goalTitle: string;
  healthScore: number;
  workspaceId: string;
  ownerId?: string | null;
  degraded: boolean;
}) {
  const { goalId, goalTitle, healthScore, workspaceId, ownerId, degraded } = params;

  const recipients = new Set<string>();
  if (ownerId) recipients.add(ownerId);

  const admins = await prisma.workspaceMember.findMany({
    where: { workspaceId, role: { in: ["admin", "pm", "exec"] } },
    select: { userId: true },
  });
  admins.forEach((a) => recipients.add(a.userId));

  const type: NotificationType = degraded ? "goal_health_degraded" : "goal_at_risk";
  const title = `Goal Health Alert: "${goalTitle}"`;
  const message = `Health score for "${goalTitle}" is at ${healthScore}%. Action is recommended to get key milestones back on schedule.`;

  const inputs: CreateNotificationInput[] = Array.from(recipients).map((userId) => ({
    userId,
    workspaceId,
    actorId: null,
    type,
    title,
    message,
    entityType: "goal",
    entityId: goalId,
    link: `/workspace/${workspaceId}/goals?goalId=${goalId}`,
    metadata: { goalId, goalTitle, healthScore },
  }));

  return createBulkNotifications(inputs);
}

/**
 * 8. Dispatch Quota Warning / Exceeded notification
 */
export async function dispatchQuotaNotification(params: {
  workspaceId: string;
  workspaceName: string;
  type: "ai_credits" | "storage";
  warningLevel: "warning_80" | "critical_90" | "exceeded";
  percentage: number;
  ownerId: string;
}) {
  const { workspaceId, workspaceName, type, warningLevel, percentage, ownerId } = params;

  const isExceeded = warningLevel === "exceeded";
  const resourceName = type === "ai_credits" ? "AI credits" : "storage space";
  const notifType: NotificationType = isExceeded ? "quota_exceeded" : "quota_warning";

  const title = isExceeded
    ? `${resourceName.toUpperCase()} Limit Reached (${workspaceName})`
    : `${resourceName} Capacity Warning (${percentage}%)`;

  const message = isExceeded
    ? `Your workspace has consumed 100% of its monthly ${resourceName}. Please upgrade your plan to restore full access.`
    : `Your workspace has reached ${percentage}% of its allocated ${resourceName}. Consider upgrading to avoid disruption.`;

  return createNotification({
    userId: ownerId,
    workspaceId,
    actorId: null,
    type: notifType,
    title,
    message,
    entityType: "workspace",
    entityId: workspaceId,
    link: `/workspace/${workspaceId}/settings`,
    metadata: { type, warningLevel, percentage },
  });
}

/**
 * 9. Dispatch Billing & Subscription events
 */
export async function dispatchBillingNotification(params: {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  type: "billing_payment_succeeded" | "billing_payment_failed";
  amount?: string;
  planLabel?: string;
}) {
  const { workspaceId, workspaceName, ownerId, type, amount, planLabel } = params;

  const isSuccess = type === "billing_payment_succeeded";
  const title = isSuccess
    ? `Subscription Renewed (${workspaceName})`
    : `Payment Failed for ${workspaceName}`;

  const message = isSuccess
    ? `Your ${planLabel || "VisionBoard"} subscription (${amount || "monthly"}) renewed successfully. AI credits have been reset.`
    : `Your latest payment attempt (${amount || "amount due"}) failed. Please update your payment method to keep your subscription active.`;

  return createNotification({
    userId: ownerId,
    workspaceId,
    actorId: null,
    type,
    title,
    message,
    entityType: "billing",
    entityId: workspaceId,
    link: `/workspace/${workspaceId}/settings`,
    metadata: { amount, planLabel },
  });
}

/**
 * 10. Dispatch Role Change notification
 */
export async function dispatchRoleChangedNotification(params: {
  targetUserId: string;
  newRole: string;
  updatedById: string;
  updatedByName: string;
  workspaceId: string;
  workspaceName: string;
}) {
  const { targetUserId, newRole, updatedById, updatedByName, workspaceId, workspaceName } = params;

  return createNotification({
    userId: targetUserId,
    workspaceId,
    actorId: updatedById,
    type: "role_changed",
    title: `Role updated in ${workspaceName}`,
    message: `${updatedByName} updated your role to "${newRole}".`,
    entityType: "workspace",
    entityId: workspaceId,
    link: `/workspace/${workspaceId}/workspace`,
    metadata: { newRole },
  });
}
