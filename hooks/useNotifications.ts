"use client";

import { useNotificationContext, type NotificationCategory, type NotificationContextType, NotificationProvider } from "@/context/NotificationContext";

export type { NotificationCategory, NotificationContextType };
export { NotificationProvider };

/**
 * useNotifications hook - consumes the centralized NotificationContext.
 * Guaranteed single network request and single SSE stream per workspace.
 */
export function useNotifications(_workspaceId?: string | null): NotificationContextType {
  return useNotificationContext();
}
