"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useBoardStore } from "@/store/board-store";
import { useCursorStore, type CursorUpdate } from "@/store/cursor-store";
import type { TaskSimple } from "@/types/board";

// Exponential backoff configuration for WebSocket reconnection
// Prevents thundering herd on mass reconnects (e.g. after backend deploy)
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
// Max reconnect attempts before giving up (prevents infinite spam)
const MAX_ATTEMPTS = 8;

export type WebSocketConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "disabled";

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

/** Allow wss:// everywhere, plus ws://localhost or ws://127.0.0.1 for local dev. */
function isAllowedWsUrl(wsUrl: string): boolean {
  if (wsUrl.startsWith("wss://")) return true;
  return /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(wsUrl);
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
const VALID_ASSIGNEE_ROLES = new Set(["owner", "contributor"]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 512;
}

/** Validate an `assignees` payload: array of `{ userId, role ∈ owner|contributor }`. */
function validateAssignees(v: unknown): { userId: string; role: string }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { userId: string; role: string }[] = [];
  for (const entry of v) {
    if (!entry || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    if (!isNonEmptyString(e.userId)) return null;
    if (!VALID_ASSIGNEE_ROLES.has(e.role as string)) return null;
    out.push({ userId: e.userId, role: e.role as string });
  }
  return out;
}

function validateTaskUpdated(data: Record<string, unknown>): {
  milestoneId: string;
  taskId: string;
  updates: Partial<TaskSimple>;
} | null {
  if (!isNonEmptyString(data.milestoneId) || !isNonEmptyString(data.taskId)) return null;

  const updates: Partial<TaskSimple> = {};

  if (data.status !== undefined) {
    if (!VALID_TASK_STATUSES.has(data.status as string)) return null;
    updates.status = data.status as string;
  }
  if (data.assignees !== undefined) {
    const assignees = validateAssignees(data.assignees);
    if (assignees === null) return null;
    updates.assignees = assignees;
  } else if (data.assigneeId !== undefined) {
    // Legacy scalar field from a mixed-version deployment. Ignore it rather than
    // rejecting the whole message, so other fields keep syncing.
  }
  if (data.title !== undefined) {
    if (!isNonEmptyString(data.title) || (data.title as string).length > 300) return null;
    updates.title = data.title as string;
  }
  if (data.priority !== undefined) {
    if (!VALID_PRIORITIES.has(data.priority as string)) return null;
    updates.priority = data.priority as string;
  }
  if (data.dueDate !== undefined) {
    if (data.dueDate === null) {
      updates.dueDate = null;
    } else if (isNonEmptyString(data.dueDate) && !isNaN(new Date(data.dueDate).getTime())) {
      updates.dueDate = data.dueDate;
    } else {
      return null;
    }
  }

  return { milestoneId: data.milestoneId as string, taskId: data.taskId as string, updates };
}

function validateTaskCreated(data: Record<string, unknown>): {
  milestoneId: string;
  task: TaskSimple;
} | null {
  if (!isNonEmptyString(data.milestoneId)) return null;
  const raw = data.task as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return null;
  if (!isNonEmptyString(raw.id) || !isNonEmptyString(raw.title)) return null;

  const status = VALID_TASK_STATUSES.has(raw.status as string) ? (raw.status as string) : "todo";
  const priority = VALID_PRIORITIES.has(raw.priority as string) ? (raw.priority as string) : "medium";
  const assignees = raw.assignees !== undefined ? (validateAssignees(raw.assignees) ?? []) : [];
  const dueDate =
    raw.dueDate === null || raw.dueDate === undefined
      ? null
      : isNonEmptyString(raw.dueDate) && !isNaN(new Date(raw.dueDate).getTime())
      ? raw.dueDate
      : null;

  return {
    milestoneId: data.milestoneId,
    task: {
      id: raw.id,
      title: raw.title,
      status,
      priority,
      storyPoints: typeof raw.storyPoints === "number" ? raw.storyPoints : null,
      assignees,
      dueDate,
    },
  };
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

function validateCursorMoved(data: Record<string, unknown>): CursorUpdate | null {
  if (!isNonEmptyString(data.userId)) return null;
  if (typeof data.x !== "number" || !isFinite(data.x)) return null;
  if (typeof data.y !== "number" || !isFinite(data.y)) return null;

  // Identity fields are OPTIONAL on the wire — the protocol sends them only
  // on the first move (and periodically after) to keep 40ms packets small.
  // The cursor store merges them with the last known identity.
  const update: CursorUpdate = { userId: data.userId as string, x: data.x, y: data.y };

  if (isNonEmptyString(data.userName)) update.userName = data.userName as string;
  if (
    isNonEmptyString(data.userColor) &&
    /^#[0-9a-fA-F]{3,8}$/.test(data.userColor as string)
  ) {
    update.userColor = data.userColor as string;
  }
  if (isNonEmptyString(data.userImage)) update.userImage = data.userImage as string;
  if (data.selectedCardId === null) {
    update.selectedCardId = null;
  } else if (isNonEmptyString(data.selectedCardId)) {
    update.selectedCardId = data.selectedCardId as string;
  }

  return update;
}
// ─────────────────────────────────────────────────────────────────────────────

export function useWebSocket(workspaceId: string | null) {
  const { data: session } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);
  const attemptsRef = useRef(0);
  const tokenRef = useRef<string | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const hasConnectedOnceRef = useRef(false);

  const wsUrlEnv = process.env.NEXT_PUBLIC_WS_URL;
  const isConfigured = Boolean(wsUrlEnv && isAllowedWsUrl(wsUrlEnv));

  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>(() =>
    isConfigured ? "connecting" : "disabled"
  );

  const sessionToken = (session as { accessToken?: string })?.accessToken ?? session?.user?.id ?? null;
  useEffect(() => {
    if (sessionToken) {
      tokenRef.current = sessionToken;
    }
  }, [sessionToken]);

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    const activeToken = tokenRef.current ?? sessionToken;
    if (!wsUrl) {
      setConnectionState("disabled");
      return;
    }
    if (!isAllowedWsUrl(wsUrl)) {
      console.warn(
        "[useWebSocket] NEXT_PUBLIC_WS_URL must use wss:// (or ws://localhost / ws://127.0.0.1 in local development). Real-time sync disabled."
      );
      setConnectionState("disabled");
      return;
    }
    if (!workspaceId || !activeToken) return;

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setConnectionState("offline");
      return;
    }

    if (isConnectingRef.current) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.CONNECTING ||
        wsRef.current.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setConnectionState("offline");
      return;
    }

    isConnectingRef.current = true;
    setConnectionState(hasConnectedOnceRef.current || attemptsRef.current > 0 ? "reconnecting" : "connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        attemptsRef.current = 0;
        hasConnectedOnceRef.current = true;
        setConnectionState("connected");
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

          if (data.type === "TASK_CREATED") {
            const validated = validateTaskCreated(data);
            if (validated) {
              useBoardStore
                .getState()
                .addTaskToMilestone(validated.milestoneId, validated.task);
            }
          }

          if (data.type === "TASK_DELETED" && isNonEmptyString(data.milestoneId) && isNonEmptyString(data.taskId)) {
            useBoardStore
              .getState()
              .removeTaskFromMilestone(data.milestoneId, data.taskId);
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
              // Written to the cursor store — only the cursor overlay layer
              // re-renders, never the board tree itself
              useCursorStore.getState().applyCursor(validated);
            }
          }

          if (data.type === "CURSOR_LEFT" && isNonEmptyString(data.userId)) {
            useCursorStore.getState().removeCursor(data.userId as string);
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
          setConnectionState("offline");
          console.warn("[useWebSocket] Connection closed: authentication failed");
          return;
        }
        attemptsRef.current += 1;
        if (attemptsRef.current < MAX_ATTEMPTS) {
          setConnectionState("reconnecting");
          const delay = getReconnectDelayMs(attemptsRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, delay);
        } else {
          setConnectionState("offline");
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
        setConnectionState("reconnecting");
        const delay = getReconnectDelayMs(attemptsRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
      } else {
        setConnectionState("offline");
      }
    }
  }, [workspaceId, sessionToken]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Manual reconnect (resets retry counter and cancels pending backoff timer)
  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    attemptsRef.current = 0;
    isConnectingRef.current = false;
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    connectRef.current();
  }, []);

  // Reconnect automatically when browser connectivity returns
  useEffect(() => {
    if (!isConfigured || !workspaceId) return;

    function handleOnline() {
      reconnect();
    }
    function handleOffline() {
      setConnectionState("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [isConfigured, workspaceId, reconnect]);

  // Clean up idle cursors after 8 seconds of inactivity
  useEffect(() => {
    const pruneInterval = setInterval(() => {
      useCursorStore.getState().pruneStale(8000);
    }, 4000);

    return () => clearInterval(pruneInterval);
  }, []);

  useEffect(() => {
    const activeToken = tokenRef.current ?? sessionToken;
    if (!workspaceId || !activeToken) return;

    attemptsRef.current = 0;
    hasConnectedOnceRef.current = false;
    connect();

    return () => {
      isConnectingRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      useCursorStore.getState().reset();
    };
  }, [connect, workspaceId, sessionToken]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { sendEvent, connectionState, reconnect };
}
