"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { NotificationResponseItem } from "@/lib/notifications";

export type NotificationCategory = "all" | "mentions" | "tasks" | "system";

export function useNotifications(workspaceId?: string | null) {
  const [notifications, setNotifications] = useState<NotificationResponseItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [category, setCategory] = useState<NotificationCategory>("all");
  const [latestLiveEvent, setLatestLiveEvent] = useState<NotificationResponseItem | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (workspaceId) params.set("workspaceId", workspaceId);
      if (category !== "all") params.set("category", category);
      params.set("limit", "40");

      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error("[useNotifications] Failed to load notifications:", err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, category]);

  // Initial load and on parameter changes
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Periodic polling fallback (every 30s)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchNotifications();
    }, 30_000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Real-time SSE Stream subscription
  useEffect(() => {
    let sse: EventSource | null = null;

    try {
      sse = new EventSource("/api/notifications/stream");
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          if (!event.data || event.data.startsWith(":")) return;
          const payload = JSON.parse(event.data);

          if (payload.type === "CONNECTED") return;

          // Received a new live notification
          const newNotif = payload as NotificationResponseItem;

          // Only show toast / prepend if scoped properly
          if (!workspaceId || !newNotif.workspaceId || newNotif.workspaceId === workspaceId) {
            setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
            setUnreadCount((prev) => prev + 1);
            setLatestLiveEvent(newNotif);
          }
        } catch (parseErr) {
          console.error("[useNotifications] SSE payload parse error:", parseErr);
        }
      };

      sse.onerror = () => {
        // SSE auto-reconnects; ignore transient network drops
      };
    } catch (err) {
      console.error("[useNotifications] SSE connection setup failed:", err);
    }

    return () => {
      if (sse) {
        sse.close();
      }
    };
  }, [workspaceId]);

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
      console.error("[useNotifications] Failed to mark as read:", err);
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
      console.error("[useNotifications] Failed to mark all read:", err);
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
      console.error("[useNotifications] Failed to delete notification:", err);
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
      console.error("[useNotifications] Failed to clear read notifications:", err);
    }
  }, [workspaceId]);

  const dismissToast = useCallback(() => {
    setLatestLiveEvent(null);
  }, []);

  return {
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
    refresh: fetchNotifications,
  };
}
