"use client";

import { useEffect, useRef, useCallback } from "react";
import { useBoardStore } from "@/store/board-store";

export function useWebSocket(workspaceId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (!workspaceId || isConnectingRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.CONNECTING || wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    isConnectingRef.current = true;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        isConnectingRef.current = false;
        console.log("⚡ Real-time WebSockets connected to VisionBoard server");
        ws.send(JSON.stringify({ type: "join", workspaceId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "TASK_UPDATED" && data.milestoneId && data.taskId) {
            const updates: Record<string, unknown> = {};
            if (data.status !== undefined) updates.status = data.status;
            if (data.assigneeId !== undefined) updates.assigneeId = data.assigneeId;
            if (data.title !== undefined) updates.title = data.title;
            if (data.priority !== undefined) updates.priority = data.priority;

            useBoardStore
              .getState()
              .updateTaskInMilestone(data.milestoneId, data.taskId, updates);
          }

          if (data.type === "CARD_UPDATED" && data.boardItem) {
            useBoardStore
              .getState()
              .updateBoardItem(data.boardItem.id, data.boardItem);
          }
        } catch (err) {
          console.error("Error parsing WebSocket message:", err);
        }
      };

      ws.onclose = () => {
        isConnectingRef.current = false;
        wsRef.current = null;
        // Quiet retry after 5 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      };

      ws.onerror = () => {
        isConnectingRef.current = false;
        // Suppress raw browser Event object logging; trigger quiet close
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    } catch {
      isConnectingRef.current = false;
      wsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, [workspaceId]);

  useEffect(() => {
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
  }, [connect]);

  const sendEvent = useCallback((event: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  return { sendEvent };
}
