"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useBoardStore } from "@/store/board-store";

// Exponential backoff configuration for WebSocket reconnection
// Prevents thundering herd on mass reconnects (e.g. after backend deploy)
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
// Max reconnect attempts before giving up (prevents infinite spam)
const MAX_ATTEMPTS = 8;

/**
 * Exponential backoff with "full jitter" per AWS best practice.
 * Formula: Delay = min(MaxDelay, BaseDelay × 2^attempt) + random(0, BaseDelay)
 *
 * This spreads reconnects across a wide time window so 1,000 clients do NOT
 * all strike the server at the exact same millisecond after a deployment.
 */
function getReconnectDelayMs(attempt: number): number {
  const cappedExp = Math.min(
    RECONNECT_MAX_DELAY,
    RECONNECT_BASE_DELAY * Math.pow(2, Math.max(0, attempt - 1))
  );
  const jitter = Math.floor(Math.random() * RECONNECT_BASE_DELAY);
  return cappedExp + jitter;
}

export interface RemoteCursor {
  userId: string;
  userName: string;
  userColor: string;
  userImage?: string | null;
  x: number;
  y: number;
  selectedCardId?: string | null;
  lastSeen: number;
}

// ── Message validators ────────────────────────────────────────────────────────
const VALID_TASK_STATUSES = new Set(["todo", "in_progress", "in_review", "blocked", "done"]);
const VALID_PRIORITIES    = new Set(["low", "medium", "high", "urgent"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 512;
}

function validateTaskUpdated(data: Record<string, unknown>): {
  milestoneId: string;
  taskId: string;
  updates: Record<string, unknown>;
} | null {
  if (!isNonEmptyString(data.milestoneId) || !isNonEmptyString(data.taskId)) return null;

  const updates: Record<string, unknown> = {};

  if (data.status !== undefined) {
    if (!VALID_TASK_STATUSES.has(data.status as string)) return null;
    updates.status = data.status;
  }
  if (data.assigneeId !== undefined) {
    if (data.assigneeId !== null && !isNonEmptyString(data.assigneeId)) return null;
    updates.assigneeId = data.assigneeId;
  }
  if (data.title !== undefined) {
    if (!isNonEmptyString(data.title) || (data.title as string).length > 300) return null;
    updates.title = data.title;
  }
  if (data.priority !== undefined) {
    if (!VALID_PRIORITIES.has(data.priority as string)) return null;
    updates.priority = data.priority;
  }

  return { milestoneId: data.milestoneId as string, taskId: data.taskId as string, updates };
}

function validateCardUpdated(data: Record<string, unknown>): {
  id: string;
  safeItem: Record<string, unknown>;
} | null {
  const item = data.boardItem as Record<string, unknown> | undefined;
  if (!item || !isNonEmptyString(item.id)) return null;

  const safeItem: Record<string, unknown> = { id: item.id };

  for (const key of ["x", "y", "width", "height"] as const) {
    if (item[key] !== undefined) {
      if (typeof item[key] !== "number" || !isFinite(item[key] as number)) return null;
      safeItem[key] = item[key];
    }
  }
  if (item.label !== undefined) {
    if (item.label !== null && (!isNonEmptyString(item.label) || (item.label as string).length > 200)) return null;
    safeItem.label = item.label;
  }
  if (item.color !== undefined) {
    if (item.color !== null) {
      if (typeof item.color !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(item.color)) return null;
    }
    safeItem.color = item.color;
  }
  for (const linkKey of ["linkedGoalId", "linkedMilestoneId", "linkedTaskId"] as const) {
    if (item[linkKey] !== undefined) {
      safeItem[linkKey] = item[linkKey];
    }
  }
  if (item.linkedGoal !== undefined) safeItem.linkedGoal = item.linkedGoal;
  if (item.linkedMilestone !== undefined) safeItem.linkedMilestone = item.linkedMilestone;
  if (item.entityType !== undefined) safeItem.entityType = item.entityType;

  return { id: item.id as string, safeItem };
}

function validateCursorMoved(data: Record<string, unknown>): RemoteCursor | null {
  if (!isNonEmptyString(data.userId)) return null;
  if (typeof data.x !== "number" || !isFinite(data.x)) return null;
  if (typeof data.y !== "number" || !isFinite(data.y)) return null;

  const userName = isNonEmptyString(data.userName) ? (data.userName as string) : "Teammate";
  const userColor = isNonEmptyString(data.userColor) && /^#[0-9a-fA-F]{3,8}$/.test(data.userColor as string)
    ? (data.userColor as string)
    : "#2563EB";
  const userImage = isNonEmptyString(data.userImage) ? (data.userImage as string) : undefined;
  const selectedCardId = isNonEmptyString(data.selectedCardId) ? (data.selectedCardId as string) : null;

  return {
    userId: data.userId as string,
    userName,
    userColor,
    userImage,
    x: data.x,
    y: data.y,
    selectedCardId,
    lastSeen: Date.now(),
  };
}
// ─────────────────────────────────────────────────────────────────────────────

export function useWebSocket(workspaceId: string | null) {
  const { data: session } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const attemptsRef = useRef(0);
  const tokenRef = useRef<string | null>(null);

  const sessionToken = (session as { accessToken?: string })?.accessToken ?? session?.user?.id ?? null;
  useEffect(() => {
    if (sessionToken) {
      tokenRef.current = sessionToken;
    }
  }, [sessionToken]);

  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});

  const connect = useCallback(async () => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    const activeToken = tokenRef.current ?? sessionToken;
    if (!wsUrl || !workspaceId || !activeToken) return;

    if (process.env.NODE_ENV === "production" && !wsUrl.startsWith("wss://")) {
      console.warn("[useWebSocket] NEXT_PUBLIC_WS_URL must use wss:// in production. Real-time sync disabled.");
      return;
    }

    if (isConnectingRef.current) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING ||
        wsRef.current.readyState === WebSocket.OPEN)
    ) return;

    if (attemptsRef.current >= MAX_ATTEMPTS) return;

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        attemptsRef.current = 0;
        ws.send(JSON.stringify({
          type: "join",
          workspaceId,
          token: activeToken,
        }));
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string" && event.data.length > 64_000) {
          console.warn("[useWebSocket] Oversized message discarded");
          return;
        }
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>;

          if (data.type === "TASK_UPDATED") {
            const validated = validateTaskUpdated(data);
            if (validated) {
              useBoardStore
                .getState()
                .updateTaskInMilestone(validated.milestoneId, validated.taskId, validated.updates);
            }
          }

          if (data.type === "CARD_UPDATED") {
            const validated = validateCardUpdated(data);
            if (validated) {
              useBoardStore.getState().updateBoardItem(validated.id, validated.safeItem);
            }
          }

          if (data.type === "CARD_CREATED" && data.boardItem) {
            const item = data.boardItem as Record<string, unknown>;
            if (item && isNonEmptyString(item.id)) {
              useBoardStore.getState().addItem(item as never);
            }
          }

          if (data.type === "CARD_DELETED" && (isNonEmptyString(data.id) || isNonEmptyString(data.boardItemId))) {
            const deletedId = ((data.id ?? data.boardItemId) as string);
            useBoardStore.getState().removeItem(deletedId);
          }

          if (data.type === "CURSOR_MOVED") {
            const validated = validateCursorMoved(data);
            if (validated) {
              setCursors((prev) => ({
                ...prev,
                [validated.userId]: validated,
              }));
            }
          }

          if (data.type === "CURSOR_LEFT" && isNonEmptyString(data.userId)) {
            const leftUserId = data.userId as string;
            setCursors((prev) => {
              const next = { ...prev };
              delete next[leftUserId];
              return next;
            });
          }
        } catch (err) {
          console.error("[useWebSocket] Error parsing message:", err);
        }
      };

      ws.onclose = (event) => {
        isConnectingRef.current = false;
        wsRef.current = null;
        if (event.code === 1008) {
          tokenRef.current = null;
          console.warn("[useWebSocket] Connection closed: authentication failed");
          return;
        }
        attemptsRef.current += 1;
        if (attemptsRef.current < MAX_ATTEMPTS) {
          const delay = getReconnectDelayMs(attemptsRef.current);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        isConnectingRef.current = false;
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          ws.close();
        }
      };
    } catch {
      isConnectingRef.current = false;
      wsRef.current = null;
      attemptsRef.current += 1;
      if (attemptsRef.current < MAX_ATTEMPTS) {
        const delay = getReconnectDelayMs(attemptsRef.current);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    }
  }, [workspaceId]);

  // Clean up idle cursors after 8 seconds of inactivity
  useEffect(() => {
    const pruneInterval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        let changed = false;
        const next: Record<string, RemoteCursor> = {};
        for (const [id, cursor] of Object.entries(prev)) {
          if (now - cursor.lastSeen <= 8000) {
            next[id] = cursor;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 4000);

    return () => clearInterval(pruneInterval);
  }, []);

  useEffect(() => {
    const activeToken = tokenRef.current ?? sessionToken;
    if (!workspaceId || !activeToken) return;

    attemptsRef.current = 0;
    connect();

    return () => {
      isConnectingRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, workspaceId, sessionToken]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { sendEvent, cursors };
}

