"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { NotificationResponseItem } from "@/lib/notifications";

export type NotificationCategory = "all" | "mentions" | "tasks" | "system";

export interface NotificationContextType {
  notifications: NotificationResponseItem[];
  unreadCount: number;
  isLoading: boolean;
  category: NotificationCategory;
  setCategory: (cat: NotificationCategory) => void;
  markAsRead: (notificationIds: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearReadNotifications: () => Promise<void>;
  latestLiveEvent: NotificationResponseItem | null;
  dismissToast: () => void;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export interface NotificationProviderProps {
  workspaceId?: string | null;
  children: React.ReactNode;
}

type NotificationPayload = {
  notifications?: NotificationResponseItem[];
  unreadCount?: number;
};

// Module-level in-flight deduplication + short 2s cache so React Strict Mode
// double-mounts or rapid route transitions don't fire duplicate parallel
// GET /api/notifications requests.
const inflightNotifications = new Map<string, Promise<NotificationPayload | null>>();
const recentNotifications = new Map<string, { data: NotificationPayload; ts: number }>();
const DEDUPE_TTL_MS = 2_000;

function invalidateNotificationCache() {
  recentNotifications.clear();
}

export function NotificationProvider({ workspaceId, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationResponseItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [category, setCategory] = useState<NotificationCategory>("all");
  const [latestLiveEvent, setLatestLiveEvent] = useState<NotificationResponseItem | null>(null);

  // Centralized fetch with module-level deduplication
  const fetchNotifications = useCallback(
    async (force = false) => {
      try {
        const params = new URLSearchParams();
        if (workspaceId) params.set("workspaceId", workspaceId);
        if (category !== "all") params.set("category", category);
        params.set("limit", "40");
        const queryKey = params.toString();

        if (!force) {
          const cached = recentNotifications.get(queryKey);
          if (cached && Date.now() - cached.ts < DEDUPE_TTL_MS) {
            setNotifications(cached.data.notifications || []);
            setUnreadCount(cached.data.unreadCount || 0);
            return;
          }
        }

        let promise = inflightNotifications.get(queryKey);
        if (!promise) {
          promise = fetch(`/api/notifications?${queryKey}`)
            .then(async (res) => {
              if (!res.ok) return null;
              const data = (await res.json()) as NotificationPayload;
              recentNotifications.set(queryKey, { data, ts: Date.now() });
              return data;
            })
            .finally(() => {
              inflightNotifications.delete(queryKey);
            });
          inflightNotifications.set(queryKey, promise);
        }

        const data = await promise;
        if (data) {
          setNotifications(data.notifications || []);
          setUnreadCount(data.unreadCount || 0);
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error?.name !== "AbortError" && error?.message !== "Failed to fetch") {
          console.warn("[NotificationContext] Transient error loading notifications:", error?.message || error);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [workspaceId, category]
  );

  // Trigger fetch on workspaceId or category change
  useEffect(() => {
    setIsLoading(true);
    void fetchNotifications();
  }, [fetchNotifications]);

  // Tab-visibility-aware interval polling (pauses when browser tab is inactive)
  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          if (typeof document === "undefined" || document.visibilityState !== "hidden") {
            fetchNotifications();
          }
        }, 30_000); // Poll every 30 seconds
      }
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        // Tab became active again — immediately refresh and resume polling
        fetchNotifications();
        startPolling();
      } else {
        // Tab is hidden in background — suspend polling to save client battery and server resources
        stopPolling();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    startPolling();

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      stopPolling();
    };
  }, [fetchNotifications]);

  // Mark single or multiple notifications as read
  const markAsRead = useCallback(async (notificationIds: string[]) => {
    invalidateNotificationCache();
    // Optimistic local state update
    setNotifications((prev) =>
      prev.map((n) => (notificationIds.includes(n.id) ? { ...n, read: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - notificationIds.length));

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds }),
      });
    } catch (err) {
      console.error("[NotificationContext] Failed to mark as read:", err);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    invalidateNotificationCache();
    // Optimistic local state update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, workspaceId: workspaceId || undefined }),
      });
    } catch (err) {
      console.error("[NotificationContext] Failed to mark all read:", err);
    }
  }, [workspaceId]);

  // Delete/dismiss notification
  const deleteNotification = useCallback(async (id: string) => {
    invalidateNotificationCache();
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      return prev.filter((n) => n.id !== id);
    });

    try {
      await fetch(`/api/notifications?id=${id}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("[NotificationContext] Failed to delete notification:", err);
    }
  }, []);

  // Clear all read notifications
  const clearReadNotifications = useCallback(async () => {
    invalidateNotificationCache();
    setNotifications((prev) => prev.filter((n) => !n.read));

    try {
      await fetch(`/api/notifications?clearRead=true${workspaceId ? `&workspaceId=${workspaceId}` : ""}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("[NotificationContext] Failed to clear read notifications:", err);
    }
  }, [workspaceId]);

  const dismissToast = useCallback(() => {
    setLatestLiveEvent(null);
  }, []);

  const refresh = useCallback(async () => {
    await fetchNotifications(true);
  }, [fetchNotifications]);

  // Memoized context value — every consumer re-renders when this object's
  // identity changes, so it must only be recreated when the underlying data
  // or one of the (already useCallback'd) action functions changes.
  // setCategory is a useState setter and inherently stable.
  const value: NotificationContextType = useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      category,
      setCategory,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearReadNotifications,
      latestLiveEvent,
      dismissToast,
      refresh,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      category,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearReadNotifications,
      latestLiveEvent,
      dismissToast,
      refresh,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationContext(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotificationContext must be used within a NotificationProvider");
  }
  return context;
}
