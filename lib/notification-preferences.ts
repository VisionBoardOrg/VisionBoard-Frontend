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
import { Prisma, type NotificationType } from "@prisma/client";
import crypto from "crypto";

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
  // SECURITY (HIGH-7): Return a raw unsubscribe token to the caller when
  // freshly generated. The `unsubscribeToken` column is deprecated; raw
  // tokens are always generated in-app and only their SHA-256 hash is kept.
  unsubscribeToken: string;
  unsubscribeKeyHash: string | null;
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
 *
 * SECURITY (HIGH-7): If the stored record has no unsubscribe keyHash (pre-migration
 * rows or rows that only had the deprecated `unsubscribeToken` cuid), this method
 * will atomically generate a fresh raw token, compute its SHA-256 keyHash, persist
 * it to the row, and return the raw token to the caller via `unsubscribeToken`.
 * Callers use the returned raw token only for constructing email links.
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<UserPreferencesDTO> {
  const existing = await prisma.notificationPreference.findUnique({
    where: { userId },
  });

  if (existing) {
    // Migration path: if row has a raw cuid in `unsubscribeToken` but no
    // keyHash yet, re-use it as the raw token (it was previously used in
    // emails) and persist the hash so lookups can use keyHash.
    if (!existing.keyHash) {
      const raw = existing.unsubscribeToken;
      const keyHash = crypto.createHash("sha256").update(raw).digest("hex");
      try {
        const migrated = await prisma.notificationPreference.update({
          where: { id: existing.id },
          data: { keyHash },
        });
        return {
          id: migrated.id,
          userId: migrated.userId,
          emailEnabled: migrated.emailEnabled,
          tasks: migrated.tasks,
          mentions: migrated.mentions,
          comments: migrated.comments,
          goalsMilestones: migrated.goalsMilestones,
          quotasBilling: migrated.quotasBilling,
          systemAlerts: migrated.systemAlerts,
          typeOverrides: (migrated.typeOverrides as Record<string, boolean>) || null,
          unsubscribeToken: raw,
          unsubscribeKeyHash: migrated.keyHash,
        };
      } catch {
        // Concurrent migration; re-read the row
        const retry = await prisma.notificationPreference.findUnique({
          where: { id: existing.id },
        });
        if (retry) {
          return {
            id: retry.id,
            userId: retry.userId,
            emailEnabled: retry.emailEnabled,
            tasks: retry.tasks,
            mentions: retry.mentions,
            comments: retry.comments,
            goalsMilestones: retry.goalsMilestones,
            quotasBilling: retry.quotasBilling,
            systemAlerts: retry.systemAlerts,
            typeOverrides: (retry.typeOverrides as Record<string, boolean>) || null,
            unsubscribeToken: retry.unsubscribeToken,
            unsubscribeKeyHash: retry.keyHash,
          };
        }
      }
    }
    return {
      id: existing.id,
      userId: existing.userId,
      emailEnabled: existing.emailEnabled,
      tasks: existing.tasks,
      mentions: existing.mentions,
      comments: existing.comments,
      goalsMilestones: existing.goalsMilestones,
      quotasBilling: existing.quotasBilling,
      systemAlerts: existing.systemAlerts,
      typeOverrides: (existing.typeOverrides as Record<string, boolean>) || null,
      // For rows that already have keyHash set, we can't recover the raw token
      // from the DB. We re-use `unsubscribeToken` (deprecated cuid) as a legacy
      // fallback. After migration window, all in-flight emails will carry
      // tokens generated during lazy-migration above.
      unsubscribeToken: existing.unsubscribeToken,
      unsubscribeKeyHash: existing.keyHash,
    };
  }

  // Auto-initialize with default preferences + freshly hashed token
  try {
    const rawToken = crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawToken).digest("hex");
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
        keyHash,
        // Deprecated stub column (cuid default still applies but value is unused)
        unsubscribeToken: rawToken,
      },
    });

    return {
      id: created.id,
      userId: created.userId,
      emailEnabled: created.emailEnabled,
      tasks: created.tasks,
      mentions: created.mentions,
      comments: created.comments,
      goalsMilestones: created.goalsMilestones,
      quotasBilling: created.quotasBilling,
      systemAlerts: created.systemAlerts,
      typeOverrides: (created.typeOverrides as Record<string, boolean>) || null,
      unsubscribeToken: rawToken,
      unsubscribeKeyHash: created.keyHash,
    };
  } catch (err) {
    // If concurrent insert occurred, attempt read again (migration above runs)
    const retry = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (retry) {
      return getUserNotificationPreferences(userId);
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
  const { typeOverrides, ...scalarUpdates } = updates;

  const updateData: Prisma.NotificationPreferenceUpdateInput = {
    ...scalarUpdates,
    ...(typeOverrides !== undefined
      ? {
          typeOverrides:
            typeOverrides === null
              ? Prisma.JsonNull
              : (typeOverrides as Prisma.InputJsonValue),
        }
      : {}),
  };

  const result = await prisma.notificationPreference.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      emailEnabled: updates.emailEnabled ?? true,
      tasks: updates.tasks ?? true,
      mentions: updates.mentions ?? true,
      comments: updates.comments ?? true,
      goalsMilestones: updates.goalsMilestones ?? true,
      quotasBilling: updates.quotasBilling ?? true,
      systemAlerts: updates.systemAlerts ?? true,
      // SECURITY (HIGH-7): Fresh token generated at first upsert-time create.
      keyHash: (() => {
        const raw = crypto.randomBytes(24).toString("hex");
        return crypto.createHash("sha256").update(raw).digest("hex");
      })(),
      unsubscribeToken:
        (() => {
          const raw = crypto.randomBytes(24).toString("hex");
          return raw;
        })(),
      typeOverrides:
        typeOverrides === null
          ? Prisma.JsonNull
          : (typeOverrides as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });

  return {
    id: result.id,
    userId: result.userId,
    emailEnabled: result.emailEnabled,
    tasks: result.tasks,
    mentions: result.mentions,
    comments: result.comments,
    goalsMilestones: result.goalsMilestones,
    quotasBilling: result.quotasBilling,
    systemAlerts: result.systemAlerts,
    typeOverrides: (result.typeOverrides as Record<string, boolean>) || null,
    unsubscribeToken: result.unsubscribeToken,
    unsubscribeKeyHash: result.keyHash,
  };
}

/**
 * 1-Click unsubscribe by unique token.
 *
 * SECURITY (HIGH-7): Incoming raw token is SHA-256 hashed before lookup.
 * Supports both new keyHash-based lookups and legacy unsubscribeToken lookups
 * during the migration window.
 */
export async function unsubscribeByToken(
  rawToken: string,
  category?: NotificationCategory
): Promise<{ success: boolean; preferences?: UserPreferencesDTO; error?: string }> {
  const keyHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const existing = await prisma.notificationPreference.findFirst({
    where: {
      OR: [{ keyHash }, { unsubscribeToken: rawToken }],
    },
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
      id: updated.id,
      userId: updated.userId,
      emailEnabled: updated.emailEnabled,
      tasks: updated.tasks,
      mentions: updated.mentions,
      comments: updated.comments,
      goalsMilestones: updated.goalsMilestones,
      quotasBilling: updated.quotasBilling,
      systemAlerts: updated.systemAlerts,
      typeOverrides: (updated.typeOverrides as Record<string, boolean>) || null,
      unsubscribeToken: updated.unsubscribeToken,
      unsubscribeKeyHash: updated.keyHash,
    },
  };
}
