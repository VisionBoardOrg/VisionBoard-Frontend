"use client";

import { useEffect, useRef, useCallback } from "react";
import { getSession } from "next-auth/react";
import { useBoardStore } from "@/store/board-store";

// Grace period before first reconnect attempt (ms)
const RECONNECT_DELAY = 5000;
// Max reconnect attempts before giving up (prevents infinite spam)
const MAX_ATTEMPTS = 5;

// ── Message validators ────────────────────────────────────────────────────────
// Validate incoming WebSocket payloads before applying them to local state.
// This prevents a compromised or MitM'd WebSocket server from injecting
// arbitrary data into the client store.

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

  return { id: item.id as string, safeItem };
}
// ─────────────────────────────────────────────────────────────────────────────

export function useWebSocket(workspaceId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const attemptsRef = useRef(0);
  // Cache the JWT token so we don't call getSession() on every reconnect
  const tokenRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl || !workspaceId) return;

    // Require wss:// in production — reject plain ws:// to prevent MitM
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

    // Fetch the session JWT to send with the join message for server-side auth.
    // We use getSession() which reads from the existing cookie — no extra network
    // request is made if the session is already cached in memory.
    if (!tokenRef.current) {
      try {
        const session = await getSession();
        // next-auth v5: session doesn't expose the raw JWT to the client.
        // We use the session user ID as a lightweight identifier and let the
        // backend verify the cookie-based JWT separately.
        // If NEXT_PUBLIC_WS_URL is the same origin, pass the session cookie
        // implicitly. Otherwise, send the user ID and rely on the Upgrade
        // request carrying the cookie header.
        tokenRef.current = (session as { accessToken?: string })?.accessToken
          ?? (session?.user as { id?: string })?.id
          ?? null;
      } catch {
        // getSession failed — skip token, server will close the connection
      }
    }

    isConnectingRef.current = true;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        attemptsRef.current = 0;
        // Include the token in the join message so the backend can authenticate
        // this connection before accepting workspace room subscriptions.
        ws.send(JSON.stringify({
          type: "join",
          workspaceId,
          // token may be null if session could not be read; the backend will
          // close the connection with 1008 in that case.
          token: tokenRef.current,
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
            } else {
              console.warn("[useWebSocket] Invalid TASK_UPDATED message discarded");
            }
          }

          if (data.type === "CARD_UPDATED") {
            const validated = validateCardUpdated(data);
            if (validated) {
              useBoardStore.getState().updateBoardItem(validated.id, validated.safeItem);
            } else {
              console.warn("[useWebSocket] Invalid CARD_UPDATED message discarded");
            }
          }
        } catch (err) {
          console.error("[useWebSocket] Error parsing message:", err);
        }
      };

      ws.onclose = (event) => {
        isConnectingRef.current = false;
        wsRef.current = null;
        // 1008: Policy Violation — auth failed. Clear cached token and don't retry.
        if (event.code === 1008) {
          tokenRef.current = null;
          console.warn("[useWebSocket] Connection closed: authentication failed");
          return;
        }
        attemptsRef.current += 1;
        if (attemptsRef.current < MAX_ATTEMPTS) {
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
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
        reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    connect();
    return () => {
      isConnectingRef.current = false;
      attemptsRef.current = MAX_ATTEMPTS;
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
  }, [connect]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { sendEvent };
}
