/**
 * lib/notification-preferences.ts
 *
 * Database-backed notification preferences management with:
 *   - Global master email toggle
 *   - Category toggles (tasks, mentions, comments, goals/milestones, billing/quotas, system)
 *   - Granular type overrides
 *   - 1-click tokenized unsubscribe logic (RFC 8058)
 */

import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

export interface UserPreferencesDTO {
  id: string;
  userId: string;
  emailEnabled: boolean;
  tasks: boolean;
  mentions: boolean;
  comments: boolean;
  goalsMilestones: boolean;
  quotasBilling: boolean;
  systemAlerts: boolean;
  typeOverrides: Record<string, boolean> | null;
  unsubscribeToken: string;
}

export type NotificationCategory =
  | "tasks"
  | "mentions"
  | "comments"
  | "goalsMilestones"
  | "quotasBilling"
  | "systemAlerts";

/**
 * Map individual notification types to broad categories.
 */
export function getCategoryForType(type: string): NotificationCategory {
  switch (type) {
    case "task_assigned":
    case "task_status_changed":
    case "task_blocked":
    case "task_due_soon":
    case "task_overdue":
    case "TASK_ASSIGNED":
      return "tasks";

    case "comment_mention":
    case "USER_MENTIONED":
      return "mentions";

    case "comment_created":
    case "COMMENT_ADDED":
      return "comments";

    case "milestone_delayed":
    case "milestone_completed":
    case "goal_at_risk":
    case "goal_health_degraded":
    case "MILESTONE_DELAYED":
    case "GOAL_HEALTH_WARNING":
      return "goalsMilestones";

    case "quota_warning":
    case "quota_exceeded":
    case "billing_payment_failed":
    case "billing_payment_succeeded":
      return "quotasBilling";

    case "workspace_invite":
    case "role_changed":
    case "system_alert":
    case "WORKSPACE_INVITE":
    default:
      return "systemAlerts";
  }
}

/**
 * Retrieve user's notification preferences. Lazily creates default record if none exists.
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<UserPreferencesDTO> {
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (existing) {
    return {
      ...existing,
      typeOverrides: (existing.typeOverrides as Record<string, boolean>) || null,
    };
  }

  // Auto-initialize with default preferences
  try {
    const created = await prisma.notificationPreference.create({
      data: {
        userId,
        emailEnabled: true,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
      },
    });

    return {
      ...created,
      typeOverrides: (created.typeOverrides as Record<string, boolean>) || null,
    };
  } catch (err) {
    // If concurrent insert occurred, attempt read again
    const retry = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (retry) {
      return {
        ...retry,
        typeOverrides: (retry.typeOverrides as Record<string, boolean>) || null,
      };
    }
    throw err;
  }
}

/**
 * Determine whether an email should be transmitted for a specific notification.
 */
export async function shouldSendEmailForNotification(
  userId: string,
  type: NotificationType | string
): Promise<{
  shouldSend: boolean;
  reason?: string;
  preferences?: UserPreferencesDTO;
}> {
  try {
    const preferences = await getUserNotificationPreferences(userId);

    // 1. Master toggle
    if (!preferences.emailEnabled) {
      return { shouldSend: false, reason: "master_email_disabled", preferences };
    }

    // 2. Fine-grained type override (if explicitly specified)
    const typeStr = String(type);
    if (preferences.typeOverrides && typeof preferences.typeOverrides[typeStr] === "boolean") {
      const allowed = preferences.typeOverrides[typeStr];
      return {
        shouldSend: allowed,
        reason: allowed ? "type_override_enabled" : "type_override_disabled",
        preferences,
      };
    }

    // 3. Category switch
    const category = getCategoryForType(typeStr);
    const categoryEnabled = preferences[category] ?? true;

    if (!categoryEnabled) {
      return {
        shouldSend: false,
        reason: `category_${category}_disabled`,
        preferences,
      };
    }

    return { shouldSend: true, preferences };
  } catch (err) {
    console.error("[notification-preferences] Error checking preferences:", err);
    // On unexpected error, default to sending to avoid dropped critical alerts
    return { shouldSend: true };
  }
}

/**
 * Update notification preferences for a user.
 */
export async function updateUserNotificationPreferences(
  userId: string,
  updates: Partial<{
    emailEnabled: boolean;
    tasks: boolean;
    mentions: boolean;
    comments: boolean;
    goalsMilestones: boolean;
    quotasBilling: boolean;
    systemAlerts: boolean;
    typeOverrides: Record<string, boolean> | null;
  }>
): Promise<UserPreferencesDTO> {
  const result = await prisma.notificationPreference.upsert({
    where: { userId },
    update: {
      ...updates,
    },
    create: {
      userId,
      emailEnabled: updates.emailEnabled ?? true,
      tasks: updates.tasks ?? true,
      mentions: updates.mentions ?? true,
      comments: updates.comments ?? true,
      goalsMilestones: updates.goalsMilestones ?? true,
      quotasBilling: updates.quotasBilling ?? true,
      systemAlerts: updates.systemAlerts ?? true,
      typeOverrides: updates.typeOverrides ?? undefined,
    },
  });

  return {
    ...result,
    typeOverrides: (result.typeOverrides as Record<string, boolean>) || null,
  };
}

/**
 * 1-Click unsubscribe by unique token.
 */
export async function unsubscribeByToken(
  token: string,
  category?: NotificationCategory
): Promise<{ success: boolean; preferences?: UserPreferencesDTO; error?: string }> {
  const existing = await prisma.notificationPreference.findUnique({
    where: { unsubscribeToken: token },
  });

  if (!existing) {
    return { success: false, error: "Invalid or expired unsubscribe token." };
  }

  const data: Record<string, boolean> = {};
  if (category && ["tasks", "mentions", "comments", "goalsMilestones", "quotasBilling", "systemAlerts"].includes(category)) {
    data[category] = false;
  } else {
    // Complete unsubscribe from all notification emails
    data.emailEnabled = false;
  }

  const updated = await prisma.notificationPreference.update({
    where: { id: existing.id },
    data,
  });

  return {
    success: true,
    preferences: {
      ...updated,
      typeOverrides: (updated.typeOverrides as Record<string, boolean>) || null,
    },
  };
}
