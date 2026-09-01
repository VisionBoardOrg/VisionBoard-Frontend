"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
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

export function NotificationProvider({ workspaceId, children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationResponseItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [category, setCategory] = useState<NotificationCategory>("all");
  const [latestLiveEvent, setLatestLiveEvent] = useState<NotificationResponseItem | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Centralized fetch with AbortSignal
  const fetchNotifications = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const params = new URLSearchParams();
        if (workspaceId) params.set("workspaceId", workspaceId);
        if (category !== "all") params.set("category", category);
        params.set("limit", "40");

        const res = await fetch(`/api/notifications?${params.toString()}`, { signal });
        if (res.ok) {
          const data = await res.json();
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

  // Trigger fetch on workspaceId or category change, cancelling any pending in-flight request
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);

    fetchNotifications(controller.signal);

    return () => {
      controller.abort();
    };
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
    await fetchNotifications();
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
