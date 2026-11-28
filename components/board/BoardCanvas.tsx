"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { BoardCard } from "./BoardCard";
import { BoardToolbar } from "./BoardToolbar";
import { CardDetailPanel } from "./CardDetailPanel";
import { LiveCursorsCanvas } from "./LiveCursorsCanvas";
import { BoardLayoutSidePanel, type BoardLayoutMode } from "./BoardLayoutSidePanel";
import { KanbanView, KANBAN_GROUPS } from "./KanbanView";
import { NLCommandBar } from "./NLCommandBar";
import { Kanban, RotateCcw, X, WifiOff, RefreshCw } from "lucide-react";
import type {
  BoardItemFull,
  GoalSimple,
  MilestoneWithTasks,
  UserSimple,
  TaskSimple,
  AIBoardAction,
} from "@/types/board";
import { useBoard, useBoardStore } from "@/store/board-store";
import { useCursorStore } from "@/store/cursor-store";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/context/ToastContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useModalA11y } from "@/hooks/useModalA11y";

// ── Module-level pure functions ───────────────────────────────────────────────

type Point = { x: number; y: number };
type Edge = "right" | "left" | "bottom" | "top";

const COLOR_PALETTE = [
  "#2563EB", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316", "#14B8A6",
];

function getUserColor(id?: string | null): string {
  if (!id) return "#2563EB";
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function cardEdges(item: BoardItemFull): Record<Edge, Point> {
  const w = item.width ?? 200;
  const h = item.height ?? 120;
  return {
    right: { x: item.x + w, y: item.y + h / 2 },
    left: { x: item.x, y: item.y + h / 2 },
    bottom: { x: item.x + w / 2, y: item.y + h },
    top: { x: item.x + w / 2, y: item.y },
  };
}

function dist(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function smartConnector(src: BoardItemFull, tgt: BoardItemFull): string {
  const srcEdges = cardEdges(src);
  const tgtEdges = cardEdges(tgt);
  const edges: Edge[] = ["right", "left", "bottom", "top"];
  let best = { srcEdge: "right" as Edge, tgtEdge: "left" as Edge, d: Infinity };
  for (const se of edges) {
    for (const te of edges) {
      if (se === te) continue;
      const d = dist(srcEdges[se], tgtEdges[te]);
      if (d < best.d) best = { srcEdge: se, tgtEdge: te, d };
    }
  }
  const p1 = srcEdges[best.srcEdge];
  const p2 = tgtEdges[best.tgtEdge];
  const CTRL = Math.max(40, best.d * 0.35);
  const offsets: Record<Edge, Point> = {
    right: { x: CTRL, y: 0 },
    left: { x: -CTRL, y: 0 },
    bottom: { x: 0, y: CTRL },
    top: { x: 0, y: -CTRL },
  };
  const c1 = { x: p1.x + offsets[best.srcEdge].x, y: p1.y + offsets[best.srcEdge].y };
  const c2 = { x: p2.x + offsets[best.tgtEdge].x, y: p2.y + offsets[best.tgtEdge].y };
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
}

interface UndoEntry {
  item: BoardItemFull;
  deletedAt: number;
  deletedEntity: boolean;
}

interface BoardCanvasProps {
  workspaceId: string;
  initialItems: BoardItemFull[];
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  members: UserSimple[];
  initialLayoutMode?: BoardLayoutMode;
  currentUser?: {
    id: string;
    name?: string | null;
    image?: string | null;
  };
}

export function BoardCanvas({
  workspaceId,
  initialItems,
  goals: initialGoals,
  milestones: initialMilestones,
  members,
  initialLayoutMode = "canvas",
  currentUser,
}: BoardCanvasProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const hydratedInitialItems = useMemo<BoardItemFull[]>(() => {
    const goalMap = new Map(initialGoals.map((g) => [g.id, g]));
    const milestoneMap = new Map(initialMilestones.map((m) => [m.id, m]));
    return initialItems.map((item) => ({
      ...item,
      linkedGoal:
        item.linkedGoal ??
        (item.linkedGoalId ? (goalMap.get(item.linkedGoalId) ?? null) : null),
      linkedMilestone:
        item.linkedMilestone ??
        (item.linkedMilestoneId ? (milestoneMap.get(item.linkedMilestoneId) ?? null) : null),
    }));
  }, [initialItems, initialGoals, initialMilestones]);

  const { items, moveItem, setItems, updateBoardItem, removeItem, addItem } = useBoard(
    workspaceId,
    hydratedInitialItems
  );

  const currentUserId = currentUser?.id;
  const currentUserName = currentUser?.name || "Teammate";
  const currentUserImage = currentUser?.image;
  const currentUserColor = useMemo(() => getUserColor(currentUserId), [currentUserId]);

  const { sendEvent, connectionState, reconnect } = useWebSocket(workspaceId, currentUserId);
  const viewersByCard = useCursorStore((s) => s.viewersByCard);
  const activeCollaborators = useCursorStore((s) => s.activeUsers);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<BoardLayoutMode>(initialLayoutMode);
  const [layoutSidePanelOpen, setLayoutSidePanelOpen] = useState(false);
  const [aiCommandOpen, setAiCommandOpen] = useState(false);

  // Sync layout preference from localStorage ONLY if cookie wasn't explicitly set
  useEffect(() => {
    try {
      const hasCookie = document.cookie.includes("vb_board_layout=");
      if (!hasCookie) {
        const saved =
          localStorage.getItem(`visionboard_layout_${workspaceId}`) ||
          localStorage.getItem("visionboard_preferred_layout");
        if (saved === "kanban" || saved === "canvas") {
          setLayoutMode(saved);
          document.cookie = `vb_board_layout=${saved}; path=/; max-age=31536000; SameSite=Lax`;
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [workspaceId]);

  const changeLayoutMode = useCallback(
    (mode: BoardLayoutMode) => {
      setLayoutMode(mode);
      try {
        localStorage.setItem(`visionboard_layout_${workspaceId}`, mode);
        localStorage.setItem("visionboard_preferred_layout", mode);
        document.cookie = `vb_board_layout=${mode}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        // ignore storage errors
      }
    },
    [workspaceId]
  );

  const [goals, setGoals] = useState<GoalSimple[]>(initialGoals);
  const [milestones, setMilestones] = useState<MilestoneWithTasks[]>(initialMilestones);

  // Debounced drag persistence timers + pending coordinates for unmount keepalive flush & rollback
  const persistTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingMoves = useRef<Map<string, { x: number; y: number; prevX: number; prevY: number }>>(new Map());

  const hasSyncedItemsRef = useRef(false);

  useEffect(() => {
    setGoals(initialGoals);
  }, [initialGoals]);

  useEffect(() => {
    setMilestones(initialMilestones);
  }, [initialMilestones]);

  useEffect(() => {
    if (!hasSyncedItemsRef.current) {
      hasSyncedItemsRef.current = true;
      return;
    }
    if (persistTimers.current.size === 0) {
      setItems(hydratedInitialItems);
      return;
    }
    const currentById = useBoardStore.getState().itemsById;
    setItems(
      hydratedInitialItems.map((item) => {
        if (persistTimers.current.has(item.id) && currentById[item.id]) {
          return { ...item, x: currentById[item.id].x, y: currentById[item.id].y };
        }
        return item;
      })
    );
  }, [hydratedInitialItems, setItems]);

  // Listen to real-time visionboard:board-updated custom events
  useEffect(() => {
    function handleBoardUpdated(e: Event) {
      const customEvent = e as CustomEvent<{
        actions?: Array<{ action: string; entityId: string }>;
        action?: { action: string; entityId: string };
        undone?: boolean;
      }>;
      const actions =
        customEvent.detail?.actions ||
        (customEvent.detail?.action ? [customEvent.detail.action] : []);
      for (const act of actions) {
        if (act.action === "delete_milestone") {
          setMilestones((prev) => prev.filter((m) => m.id !== act.entityId));
        } else if (act.action === "delete_goal") {
          setGoals((prev) => prev.filter((g) => g.id !== act.entityId));
        }
      }
    }
    window.addEventListener("visionboard:board-updated", handleBoardUpdated);
    return () => window.removeEventListener("visionboard:board-updated", handleBoardUpdated);
  }, []);

  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const [undoToastHovered, setUndoToastHovered] = useState(false);
  const [pendingResetConfirmation, setPendingResetConfirmation] = useState<{
    itemId: string;
    milestoneId: string;
    milestoneTitle: string;
    newStatus: string;
    taskCount: number;
  } | null>(null);

  const resetDialogRef = useRef<HTMLDialogElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  useModalA11y(resetDialogRef, () => setPendingResetConfirmation(null), Boolean(pendingResetConfirmation), {
    initialFocusRef: resetCancelRef,
  });

  const lastDeleted = undoStack[undoStack.length - 1];
  const canvasRef = useRef<HTMLDivElement>(null);
  const canvasTransformRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss Undo toast after 10 seconds (pauses on hover/focus)
  useEffect(() => {
    if (!showUndoToast || !lastDeleted || undoToastHovered) return;
    const timer = setTimeout(() => {
      setShowUndoToast(false);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [showUndoToast, lastDeleted, undoToastHovered]);

  // dnd-kit sensors (Pointer + Touch + Keyboard)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // Refs for smooth direct-DOM panning & zooming
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const lastCursorEmitRef = useRef<number>(0);
  const lastCursorWorldRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const cursorPacketCountRef = useRef(0);
  const panRafRef = useRef<number | null>(null);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Broadcast selectedCardId immediately whenever selection changes
  useEffect(() => {
    if (!currentUserId) return;
    sendEvent({
      type: "CURSOR_MOVED",
      workspaceId,
      userId: currentUserId,
      x: lastCursorWorldRef.current.x,
      y: lastCursorWorldRef.current.y,
      selectedCardId: selectedId,
      userName: currentUserName,
      userColor: currentUserColor,
      userImage: currentUserImage,
    });
  }, [selectedId, currentUserId, currentUserName, currentUserColor, currentUserImage, workspaceId, sendEvent]);

  // Broadcast CURSOR_LEFT on unmount so remote collaborators clear our cursor promptly
  useEffect(() => {
    if (!currentUserId) return;
    return () => {
      sendEvent({
        type: "CURSOR_LEFT",
        workspaceId,
        userId: currentUserId,
      });
    };
  }, [currentUserId, workspaceId, sendEvent]);

  const applyTransformDOM = useCallback((nextX: number, nextY: number, nextZoom: number) => {
    if (canvasTransformRef.current) {
      canvasTransformRef.current.style.transform = `translate(${nextX}px, ${nextY}px) scale(${nextZoom})`;
    }
    if (gridRef.current) {
      gridRef.current.style.backgroundSize = `${20 * nextZoom}px ${20 * nextZoom}px`;
      gridRef.current.style.backgroundPosition = `${nextX % (20 * nextZoom)}px ${nextY % (20 * nextZoom)}px`;
    }
  }, []);

  const applyPan = useCallback(
    (dx: number, dy: number) => {
      panRef.current.x += dx;
      panRef.current.y += dy;

      if (panRafRef.current === null) {
        panRafRef.current = requestAnimationFrame(() => {
          panRafRef.current = null;
          applyTransformDOM(panRef.current.x, panRef.current.y, zoomRef.current);
        });
      }
    },
    [applyTransformDOM]
  );

  useEffect(() => {
    return () => {
      if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
    };
  }, []);

  // Release stuck pan even if mouseup happens outside the canvas/window
  useEffect(() => {
    function handleWindowMouseUp() {
      if (isPanning.current) {
        isPanning.current = false;
        setPan({ x: panRef.current.x, y: panRef.current.y });
        if (canvasRef.current) {
          canvasRef.current.style.cursor = "grab";
        }
      }
    }
    window.addEventListener("mouseup", handleWindowMouseUp);
    window.addEventListener("blur", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
      window.removeEventListener("blur", handleWindowMouseUp);
    };
  }, []);

  // Zoom around a specific client viewport point (keeps focal point under cursor)
  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, nextZoomRaw: number) => {
      const container = canvasRef.current;
      const nextZoom = Math.min(2, Math.max(0.3, nextZoomRaw));
      const prevZoom = zoomRef.current;
      if (Math.abs(nextZoom - prevZoom) < 0.0001) return;

      if (container) {
        const rect = container.getBoundingClientRect();
        const cursorX = clientX - rect.left;
        const cursorY = clientY - rect.top;
        const worldX = (cursorX - panRef.current.x) / prevZoom;
        const worldY = (cursorY - panRef.current.y) / prevZoom;
        const nextPanX = cursorX - worldX * nextZoom;
        const nextPanY = cursorY - worldY * nextZoom;

        panRef.current = { x: nextPanX, y: nextPanY };
        zoomRef.current = nextZoom;
        applyTransformDOM(nextPanX, nextPanY, nextZoom);
        setPan({ x: nextPanX, y: nextPanY });
        setZoom(nextZoom);
      } else {
        zoomRef.current = nextZoom;
        setZoom(nextZoom);
      }
    },
    [applyTransformDOM]
  );

  // Native non-passive wheel listener so preventDefault() never warns in Chrome/Safari
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || layoutMode !== "canvas") return;

    function handleNativeWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.ctrlKey ? 0.006 : 0.0012;
      const nextZoom = zoomRef.current - e.deltaY * factor;
      zoomAtPoint(e.clientX, e.clientY, nextZoom);
    }

    el.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleNativeWheel);
  }, [layoutMode, zoomAtPoint]);

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-board-card]")) return;
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLDivElement).style.cursor = "grabbing";
  }

  function onMouseMove(e: React.MouseEvent) {
    if (isPanning.current) {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      applyPan(dx, dy);
      lastPos.current = { x: e.clientX, y: e.clientY };
    }

    // Broadcast mouse position in canvas coordinates (~25fps / 40ms)
    if (currentUserId && canvasRef.current) {
      const now = Date.now();
      if (now - lastCursorEmitRef.current >= 40) {
        lastCursorEmitRef.current = now;
        cursorPacketCountRef.current += 1;
        const includeIdentity = cursorPacketCountRef.current % 25 === 1;
        const rect = canvasRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current;
        const canvasY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current;
        lastCursorWorldRef.current = { x: canvasX, y: canvasY };

        sendEvent({
          type: "CURSOR_MOVED",
          workspaceId,
          userId: currentUserId,
          x: canvasX,
          y: canvasY,
          selectedCardId: selectedId,
          ...(includeIdentity
            ? {
                userName: currentUserName,
                userColor: currentUserColor,
                userImage: currentUserImage,
              }
            : {}),
        });
      }
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    if (isPanning.current) {
      isPanning.current = false;
      setPan({ x: panRef.current.x, y: panRef.current.y });
    }
    (e.currentTarget as HTMLDivElement).style.cursor = "grab";
  }

  // Touch panning + 2-finger pinch-to-zoom
  const touchOnCard = useRef(false);
  const pinchState = useRef<{ initialDist: number; initialZoom: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      isPanning.current = false;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      pinchState.current = {
        initialDist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        initialZoom: zoomRef.current,
      };
      return;
    }

    const onCard = !!(e.target as HTMLElement).closest("[data-board-card]");
    touchOnCard.current = onCard;
    if (onCard) return;
    if (e.touches.length !== 1) return;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isPanning.current = true;
  }

  // Native non-passive touchmove listener so preventDefault() never warns in Chrome/Safari
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || layoutMode !== "canvas") return;

    function handleNativeTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchState.current) {
        if (e.cancelable) e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (pinchState.current.initialDist > 0) {
          const scale = currentDist / pinchState.current.initialDist;
          const midX = (t1.clientX + t2.clientX) / 2;
          const midY = (t1.clientY + t2.clientY) / 2;
          zoomAtPoint(midX, midY, pinchState.current.initialZoom * scale);
        }
        return;
      }

      if (!isPanning.current || touchOnCard.current) return;
      if (e.touches.length !== 1) return;
      if (e.cancelable) e.preventDefault();
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      applyPan(dx, dy);
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }

    el.addEventListener("touchmove", handleNativeTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleNativeTouchMove);
  }, [layoutMode, zoomAtPoint, applyPan]);

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) {
      pinchState.current = null;
    }
    if (isPanning.current && e.touches.length === 0) {
      isPanning.current = false;
      setPan({ x: panRef.current.x, y: panRef.current.y });
    }
    if (e.touches.length === 0) {
      touchOnCard.current = false;
    }
  }

  // Canvas keyboard controls (Escape to deselect, Arrow keys to pan when canvas itself has focus)
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setSelectedId(null);
      return;
    }

    if (layoutMode !== "canvas") return;
    if (e.target !== e.currentTarget) return; // Don't hijack arrow keys inside cards, inputs, or modals

    const step = e.shiftKey ? 150 : 60;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      panRef.current = { x: panRef.current.x + step, y: panRef.current.y };
      applyTransformDOM(panRef.current.x, panRef.current.y, zoomRef.current);
      setPan({ ...panRef.current });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      panRef.current = { x: panRef.current.x - step, y: panRef.current.y };
      applyTransformDOM(panRef.current.x, panRef.current.y, zoomRef.current);
      setPan({ ...panRef.current });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      panRef.current = { x: panRef.current.x, y: panRef.current.y + step };
      applyTransformDOM(panRef.current.x, panRef.current.y, zoomRef.current);
      setPan({ ...panRef.current });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      panRef.current = { x: panRef.current.x, y: panRef.current.y - step };
      applyTransformDOM(panRef.current.x, panRef.current.y, zoomRef.current);
      setPan({ ...panRef.current });
    }
  }

  // Flush any pending debounced drag PATCHes on unmount with keepalive
  useEffect(() => {
    const timers = persistTimers.current;
    const moves = pendingMoves.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      moves.forEach((coords, itemId) => {
        fetch(`/api/board-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: coords.x, y: coords.y }),
          keepalive: true,
        }).catch(() => {});
      });
      moves.clear();
    };
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const itemId = active.id as string;
      const item = useBoardStore.getState().itemsById[itemId];
      if (!item) return;

      const currentZoom = zoomRef.current || 1;
      const newX = item.x + delta.x / currentZoom;
      const newY = item.y + delta.y / currentZoom;
      if (newX === item.x && newY === item.y) return;

      // Preserve the very first pre-drag coordinates for rollback if multiple drags happen within 400ms
      const existingPending = pendingMoves.current.get(itemId);
      const prevX = existingPending ? existingPending.prevX : item.x;
      const prevY = existingPending ? existingPending.prevY : item.y;
      pendingMoves.current.set(itemId, { x: newX, y: newY, prevX, prevY });

      moveItem(itemId, newX, newY);

      sendEvent({
        type: "CARD_UPDATED",
        workspaceId,
        boardItem: { ...item, x: newX, y: newY },
      });

      const existingTimer = persistTimers.current.get(itemId);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(async () => {
        persistTimers.current.delete(itemId);
        const latestPending = pendingMoves.current.get(itemId);
        pendingMoves.current.delete(itemId);
        const targetX = latestPending?.x ?? newX;
        const targetY = latestPending?.y ?? newY;
        const rollbackX = latestPending?.prevX ?? prevX;
        const rollbackY = latestPending?.prevY ?? prevY;

        try {
          const res = await fetch(`/api/board-items/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: targetX, y: targetY }),
          });
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
        } catch {
          moveItem(itemId, rollbackX, rollbackY);
          const currentItem = useBoardStore.getState().itemsById[itemId];
          if (currentItem) {
            sendEvent({
              type: "CARD_UPDATED",
              workspaceId,
              boardItem: { ...currentItem, x: rollbackX, y: rollbackY },
            });
          }
          toast({
            type: "error",
            title: "Could not save card position",
            description: "The card was moved back to its last saved position. Please try again.",
          });
        }
      }, 400);

      persistTimers.current.set(itemId, timer);
    },
    [moveItem, sendEvent, workspaceId, toast]
  );

  const handleDragStart = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(35);
      } catch {
        // ignore unsupported vibration
      }
    }
  }, []);

  // Viewport-aware spawn coordinates so new cards appear right in front of the user
  const getSpawnPosition = useCallback(
    (_entityType: "goal" | "milestone" | "note", cardWidth: number, cardHeight: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const z = zoomRef.current || 1;
      const viewCenterX = rect
        ? (-panRef.current.x + rect.width / 2 - cardWidth / 2) / z
        : (-panRef.current.x + 200) / z;
      const viewCenterY = rect
        ? (-panRef.current.y + rect.height / 2 - cardHeight / 2) / z
        : (-panRef.current.y + 140) / z;

      // Cascade slightly if another card is already sitting right on this spot
      const existing = useBoardStore.getState().getAllItems();
      let x = Math.round(viewCenterX);
      let y = Math.round(viewCenterY);
      let attempts = 0;
      while (
        attempts < 12 &&
        existing.some((i) => Math.abs(i.x - x) < 28 && Math.abs(i.y - y) < 28)
      ) {
        x += 32;
        y += 32;
        attempts += 1;
      }
      return { x, y };
    },
    []
  );

  const handleItemReconciled = useCallback((tempId: string, realItem: BoardItemFull) => {
    setSelectedId((prev) => (prev === tempId ? realItem.id : prev));
  }, []);

  // Safe, explicit card removal vs permanent entity deletion with atomic rollback on 403/error
  const handleDeleteCard = useCallback(
    async (itemId: string, options?: { mode?: "remove-card" | "delete-entity" }) => {
      const item = useBoardStore.getState().itemsById[itemId];
      if (!item) return;

      const isGoalOrMilestone = item.entityType === "goal" || item.entityType === "milestone";
      let mode = options?.mode;

      if (!mode) {
        const title =
          item.entityType === "milestone"
            ? item.linkedMilestone?.title ?? item.label ?? "this milestone"
            : item.linkedGoal?.title ?? item.label ?? `this ${item.entityType}`;

        if (isGoalOrMilestone) {
          const confirmed = await confirm({
            title: `Remove “${title}” from board?`,
            description:
              "This removes the card from the board without deleting the underlying " +
              `${item.entityType} or its tasks. To permanently delete the ${item.entityType}, open its details panel.`,
            confirmLabel: "Remove from board",
            cancelLabel: "Cancel",
          });
          if (!confirmed) return;
          mode = "remove-card";
        } else {
          const confirmed = await confirm({
            title: `Delete “${title}”?`,
            description: "You can undo this action immediately from the toast notification.",
            confirmLabel: "Delete",
            cancelLabel: "Cancel",
            danger: true,
          });
          if (!confirmed) return;
          mode = "remove-card";
        }
      }

      const deleteEntity = mode === "delete-entity" && isGoalOrMilestone;

      // Snapshot state for atomic rollback
      const prevGoals = goals;
      const prevMilestones = milestones;

      // Cancel any pending move timer for this card
      const pendingTimer = persistTimers.current.get(itemId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        persistTimers.current.delete(itemId);
        pendingMoves.current.delete(itemId);
      }

      // Optimistic removal
      removeItem(itemId);
      if (deleteEntity) {
        if (item.entityType === "milestone" && item.linkedMilestoneId) {
          setMilestones((prev) => prev.filter((m) => m.id !== item.linkedMilestoneId));
        } else if (item.entityType === "goal" && item.linkedGoalId) {
          setGoals((prev) => prev.filter((g) => g.id !== item.linkedGoalId));
        }
      }
      if (selectedId === itemId) setSelectedId(null);

      try {
        if (deleteEntity && item.entityType === "goal" && item.linkedGoalId) {
          const res = await fetch(`/api/goals/${item.linkedGoalId}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            // Atomic rollback — NEVER delete board card if entity DELETE failed (e.g. 403)
            addItem(item);
            setGoals(prevGoals);
            toast({
              type: "error",
              title: "Couldn't delete goal",
              description: data.error ?? "You do not have permission to delete this goal.",
            });
            return;
          }
        } else if (deleteEntity && item.entityType === "milestone" && item.linkedMilestoneId) {
          const res = await fetch(`/api/milestones/${item.linkedMilestoneId}`, { method: "DELETE" });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            addItem(item);
            setMilestones(prevMilestones);
            toast({
              type: "error",
              title: "Couldn't delete milestone",
              description: data.error ?? "You do not have permission to delete this milestone.",
            });
            return;
          }
        }

        const boardRes = await fetch(`/api/board-items/${itemId}`, { method: "DELETE" });
        // 404 is expected if cascade-deleting the goal/milestone already deleted the boardItem row
        if (!boardRes.ok && boardRes.status !== 404) {
          const data = await boardRes.json().catch(() => ({}));
          addItem(item);
          if (deleteEntity) {
            setGoals(prevGoals);
            setMilestones(prevMilestones);
          }
          toast({
            type: "error",
            title: "Couldn't remove card",
            description: data.error ?? "Failed to remove card from the board.",
          });
          return;
        }

        // Server succeeded — record on Undo stack & broadcast over WS
        setUndoStack((prev) => [...prev, { item, deletedAt: Date.now(), deletedEntity: deleteEntity }]);
        setShowUndoToast(true);

        if (sendEvent && workspaceId) {
          sendEvent({
            type: "CARD_DELETED",
            workspaceId,
            id: itemId,
          });
        }
      } catch (err) {
        console.error("[BoardCanvas] Failed to delete board item:", err);
        addItem(item);
        if (deleteEntity) {
          setGoals(prevGoals);
          setMilestones(prevMilestones);
        }
        toast({
          type: "error",
          title: "Connection error",
          description: "Failed to complete delete. Your card has been restored.",
        });
      }
    },
    [goals, milestones, selectedId, sendEvent, workspaceId, removeItem, addItem, toast, confirm]
  );

  const handleSelectCard = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const restoredItem = last.item;

    setUndoStack((prev) => prev.slice(0, -1));
    if (undoStack.length <= 1) {
      setShowUndoToast(false);
    }

    // Optimistically put item back in store
    addItem(restoredItem);

    try {
      let restoredMilestoneId = restoredItem.linkedMilestoneId;
      let restoredGoalId = restoredItem.linkedGoalId;
      let restoredGoalEntity = restoredItem.linkedGoal;
      let restoredMilestoneEntity = restoredItem.linkedMilestone;

      // Only recreate underlying Goal/Milestone if it was actually deleted
      if (last.deletedEntity && restoredItem.entityType === "milestone" && restoredItem.linkedMilestone) {
        const ms = restoredItem.linkedMilestone as MilestoneWithTasks & { startDate?: Date | string | null };
        const targetGoalId = ms.goalId || (goals.length > 0 ? goals[0].id : null);
        if (targetGoalId) {
          const res = await fetch(`/api/milestones`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              goalId: targetGoalId,
              title: ms.title,
              description: ms.description ?? "",
              status: ["planned", "in_progress", "completed", "delayed"].includes(ms.status)
                ? ms.status
                : "planned",
              startDate: ms.startDate ? new Date(ms.startDate).toISOString() : undefined,
              targetDate: ms.targetDate ? new Date(ms.targetDate).toISOString() : undefined,
            }),
          });
          if (!res.ok) throw new Error("Failed to restore milestone");
          const data = await res.json();
          if (data.milestone?.id) {
            restoredMilestoneId = data.milestone.id;
            const restoredTasks: TaskSimple[] = [];

            if (ms.tasks && ms.tasks.length > 0) {
              const results = await Promise.allSettled(
                ms.tasks.map(async (t) => {
                  const taskRes = await fetch(`/api/tasks`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      milestoneId: restoredMilestoneId,
                      title: t.title,
                      priority: t.priority ?? "medium",
                      assignees: (t.assignees ?? []).map((a) => ({ userId: a.userId, role: a.role })),
                      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
                    }),
                  });
                  if (!taskRes.ok) return null;
                  const taskData = await taskRes.json();
                  const createdTask = taskData.task as TaskSimple;
                  // Restore original status & storyPoints if non-default
                  if (t.status !== "todo" || t.storyPoints != null) {
                    const patchRes = await fetch(`/api/tasks/${createdTask.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        status: t.status,
                        storyPoints: t.storyPoints,
                      }),
                    });
                    if (patchRes.ok) {
                      const patched = await patchRes.json();
                      return (patched.task ?? { ...createdTask, status: t.status, storyPoints: t.storyPoints }) as TaskSimple;
                    }
                  }
                  return createdTask;
                })
              );
              for (const r of results) {
                if (r.status === "fulfilled" && r.value) {
                  restoredTasks.push(r.value);
                }
              }
            }

            restoredMilestoneEntity = {
              ...data.milestone,
              tasks: restoredTasks,
            };
            setMilestones((prev) => [...prev, restoredMilestoneEntity!]);
          }
        }
      } else if (last.deletedEntity && restoredItem.entityType === "goal" && restoredItem.linkedGoal) {
        const g = restoredItem.linkedGoal as GoalSimple & { keyResults?: unknown };
        const res = await fetch(`/api/goals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            title: g.title,
            objective: g.objective || g.title,
            status: ["draft", "active", "completed", "cancelled"].includes(g.status)
              ? g.status
              : "active",
            targetDate: g.targetDate ? new Date(g.targetDate).toISOString() : undefined,
            keyResults: Array.isArray(g.keyResults) ? g.keyResults : undefined,
          }),
        });
        if (!res.ok) throw new Error("Failed to restore goal");
        const data = await res.json();
        if (data.goal?.id) {
          restoredGoalId = data.goal.id;
          restoredGoalEntity = data.goal;
          setGoals((prev) => [...prev, data.goal]);
        }
      }

      const resBoardItem = await fetch(`/api/board-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          entityType: restoredItem.entityType,
          x: restoredItem.x,
          y: restoredItem.y,
          width: restoredItem.width,
          height: restoredItem.height,
          label: restoredItem.label ?? undefined,
          linkedGoalId: restoredGoalId ?? undefined,
          linkedMilestoneId: restoredMilestoneId ?? undefined,
          color: restoredItem.color ?? undefined,
        }),
      });

      if (!resBoardItem.ok) {
        throw new Error("Failed to recreate board card");
      }

      const data = await resBoardItem.json();
      if (data.boardItem) {
        const hydratedRestored: BoardItemFull = {
          ...data.boardItem,
          linkedGoal: restoredGoalEntity ?? data.boardItem.linkedGoal ?? null,
          linkedMilestone: restoredMilestoneEntity ?? data.boardItem.linkedMilestone ?? null,
        };
        useBoardStore.getState().replaceItemId(restoredItem.id, hydratedRestored);
        if (sendEvent && workspaceId) {
          sendEvent({
            type: "CARD_CREATED",
            workspaceId,
            boardItem: hydratedRestored,
          });
        }
      }
    } catch (err) {
      console.error("[BoardCanvas] Failed to restore deleted item:", err);
      removeItem(restoredItem.id);
      toast({
        type: "error",
        title: "Could not undo deletion",
        description: "Restoring the card failed. Please try again.",
      });
    }
  }, [goals, undoStack, workspaceId, sendEvent, addItem, removeItem, toast]);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select" || isEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (layoutMode === "canvas" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setZoom((prev) => Math.min(2, prev + 0.1));
        } else if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          setZoom((prev) => Math.max(0.3, prev - 0.1));
        } else if (e.key === "0") {
          e.preventDefault();
          setZoom(1);
          setPan({ x: 0, y: 0 });
          panRef.current = { x: 0, y: 0 };
          zoomRef.current = 1;
          applyTransformDOM(0, 0, 1);
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleUndo, layoutMode, applyTransformDOM]);

  const handleItemStatusChange = useCallback(
    async (itemId: string, newStatus: string, options?: { cascadeTasks?: boolean }) => {
      const item = useBoardStore.getState().itemsById[itemId];
      if (!item) return;

      // Prompt before resetting child tasks when moving a completed milestone back to planned/todo
      if (
        item.entityType === "milestone" &&
        item.linkedMilestoneId &&
        item.linkedMilestone &&
        options?.cascadeTasks === undefined
      ) {
        const currentMilestoneStatus = (item.linkedMilestone.status || "").toLowerCase();
        const isCurrentlyDone =
          currentMilestoneStatus === "completed" ||
          currentMilestoneStatus === "done" ||
          currentMilestoneStatus === "complete";
        const isTargetingToDo = newStatus === "planned" || newStatus === "todo";
        const tasks = item.linkedMilestone.tasks ?? [];

        if (isCurrentlyDone && isTargetingToDo && tasks.length > 0) {
          setPendingResetConfirmation({
            itemId,
            milestoneId: item.linkedMilestoneId,
            milestoneTitle: item.linkedMilestone.title || item.label || "Milestone",
            newStatus,
            taskCount: tasks.length,
          });
          return;
        }
      }

      const shouldCascade = options?.cascadeTasks ?? false;

      // Capture full previous snapshots (including child tasks!) for clean rollback
      const prevGoalSnapshot =
        item.entityType === "goal" && item.linkedGoalId
          ? goals.find((g) => g.id === item.linkedGoalId) ?? item.linkedGoal
          : null;
      const prevMilestoneSnapshot =
        item.entityType === "milestone" && item.linkedMilestoneId
          ? milestones.find((m) => m.id === item.linkedMilestoneId) ?? item.linkedMilestone
          : null;

      const reportFailure = () => {
        if (item.entityType === "goal" && item.linkedGoalId && prevGoalSnapshot) {
          setGoals((prev) =>
            prev.map((g) => (g.id === item.linkedGoalId ? prevGoalSnapshot : g))
          );
          updateBoardItem(item.id, { linkedGoal: prevGoalSnapshot });
        } else if (item.entityType === "milestone" && item.linkedMilestoneId && prevMilestoneSnapshot) {
          setMilestones((prev) =>
            prev.map((m) => (m.id === item.linkedMilestoneId ? prevMilestoneSnapshot : m))
          );
          updateBoardItem(item.id, { linkedMilestone: prevMilestoneSnapshot });
        }
        toast({
          type: "error",
          title: "Couldn't save status change",
          description: `Moving “${
            item.linkedMilestone?.title ?? item.linkedGoal?.title ?? item.label ?? item.entityType
          }” to ${newStatus.replace("_", " ")} failed. The change was reverted — please try again.`,
        });
      };

      let succeeded = false;
      try {
        if (item.entityType === "goal" && item.linkedGoalId) {
          setGoals((prev) =>
            prev.map((g) => (g.id === item.linkedGoalId ? { ...g, status: newStatus } : g))
          );
          if (item.linkedGoal) {
            updateBoardItem(item.id, { linkedGoal: { ...item.linkedGoal, status: newStatus } });
          }
          const res = await fetch(`/api/goals/${item.linkedGoalId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) {
            reportFailure();
          } else {
            succeeded = true;
          }
        } else if (item.entityType === "milestone" && item.linkedMilestoneId) {
          const targetTaskStatus =
            newStatus === "completed" || newStatus === "done" || newStatus === "complete"
              ? "done"
              : shouldCascade
              ? newStatus === "planned" || newStatus === "todo"
                ? "todo"
                : newStatus === "in_progress" || newStatus === "active"
                ? "in_progress"
                : newStatus === "delayed" || newStatus === "blocked"
                ? "blocked"
                : null
              : null;

          setMilestones((prev) =>
            prev.map((m) => {
              if (m.id === item.linkedMilestoneId) {
                const updatedTasks = targetTaskStatus
                  ? (m.tasks ?? []).map((t) => ({ ...t, status: targetTaskStatus }))
                  : m.tasks;
                return { ...m, status: newStatus, tasks: updatedTasks };
              }
              return m;
            })
          );
          if (item.linkedMilestone) {
            const updatedTasks = targetTaskStatus
              ? (item.linkedMilestone.tasks ?? []).map((t) => ({ ...t, status: targetTaskStatus }))
              : item.linkedMilestone.tasks;
            updateBoardItem(item.id, {
              linkedMilestone: {
                ...item.linkedMilestone,
                status: newStatus,
                tasks: updatedTasks,
              },
            });
          }
          const res = await fetch(`/api/milestones/${item.linkedMilestoneId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus, cascadeTasks: shouldCascade }),
          });
          if (!res.ok) {
            reportFailure();
          } else {
            succeeded = true;
          }
        } else if (item.entityType === "task" && item.linkedTaskId) {
          // Do NOT overwrite item.label with status — only PATCH the linked task
          const res = await fetch(`/api/tasks/${item.linkedTaskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) {
            reportFailure();
          } else {
            succeeded = true;
          }
        }
      } catch {
        reportFailure();
      }

      // Broadcast the FRESH updated boardItem ONLY if the server accepted the change
      if (succeeded && sendEvent) {
        const freshItem = useBoardStore.getState().itemsById[item.id];
        if (freshItem) {
          sendEvent({
            type: "CARD_UPDATED",
            workspaceId,
            boardItem: freshItem,
          });
        }
      }
    },
    [goals, milestones, workspaceId, sendEvent, updateBoardItem, toast]
  );

  const handleTaskToggle = useCallback(
    async (taskId: string, newStatus: string, milestoneId?: string) => {
      const applyTaskStatus = (status: string) => {
        if (milestoneId) {
          setMilestones((prev) =>
            prev.map((m) => {
              if (m.id === milestoneId) {
                const mTasks = m.tasks ?? [];
                const updatedTasks = mTasks.map((t: TaskSimple) => (t.id === taskId ? { ...t, status } : t));
                const allDone = updatedTasks.length > 0 && updatedTasks.every((t: TaskSimple) => t.status === "done");
                const anyStarted = updatedTasks.some(
                  (t: TaskSimple) => t.status === "done" || t.status === "in_progress" || t.status === "in_review"
                );
                const newMilestoneStatus = allDone ? "completed" : anyStarted ? "in_progress" : "planned";
                return { ...m, status: newMilestoneStatus, tasks: updatedTasks };
              }
              return m;
            })
          );
          const currentItems = useBoardStore.getState().getAllItems();
          setItems(
            currentItems.map((item) => {
              if (item.entityType === "milestone" && item.linkedMilestoneId === milestoneId && item.linkedMilestone) {
                const mTasks = item.linkedMilestone.tasks ?? [];
                const updatedTasks = mTasks.map((t: TaskSimple) => (t.id === taskId ? { ...t, status } : t));
                const allDone = updatedTasks.length > 0 && updatedTasks.every((t: TaskSimple) => t.status === "done");
                const anyStarted = updatedTasks.some(
                  (t: TaskSimple) => t.status === "done" || t.status === "in_progress" || t.status === "in_review"
                );
                const newMilestoneStatus = allDone ? "completed" : anyStarted ? "in_progress" : "planned";
                return {
                  ...item,
                  linkedMilestone: {
                    ...item.linkedMilestone,
                    status: newMilestoneStatus,
                    tasks: updatedTasks,
                  },
                };
              }
              return item;
            })
          );
        }
      };

      const oldStatus =
        milestones.find((m) => m.id === milestoneId)?.tasks?.find((t) => t.id === taskId)?.status ??
        useBoardStore
          .getState()
          .getAllItems()
          .find((i) => i.linkedMilestoneId === milestoneId)
          ?.linkedMilestone?.tasks?.find((t) => t.id === taskId)?.status ??
        "todo";

      applyTaskStatus(newStatus);

      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error(`PATCH failed with ${res.status}`);
        if (sendEvent && milestoneId) {
          sendEvent({
            type: "TASK_UPDATED",
            workspaceId,
            milestoneId,
            taskId,
            status: newStatus,
          });
        }
      } catch (err) {
        console.error("[BoardCanvas] Failed to update task status:", err);
        applyTaskStatus(oldStatus);
        toast({
          type: "error",
          title: "Couldn't save task status",
          description: "The task status change failed and was reverted. Check your connection and try again.",
        });
      }
    },
    [milestones, setItems, toast, sendEvent, workspaceId]
  );

  const handleAddTaskToMilestone = useCallback(
    async (milestoneId: string, title: string) => {
      try {
        const res = await fetch(`/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            milestoneId,
            status: "todo",
            priority: "medium",
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast({
            type: "error",
            title: "Couldn't add task",
            description: errData.error ?? "Failed to create task. Please try again.",
          });
          return;
        }
        const data = await res.json();
        const newTask: TaskSimple = data.task;
        setMilestones((prev) =>
          prev.map((m) => (m.id === milestoneId ? { ...m, tasks: [...(m.tasks ?? []), newTask] } : m))
        );
        useBoardStore.getState().addTaskToMilestone(milestoneId, newTask);
        sendEvent({
          type: "TASK_CREATED",
          workspaceId,
          milestoneId,
          task: newTask,
        });
      } catch (err) {
        console.error("Failed to add task to milestone:", err);
        toast({
          type: "error",
          title: "Connection error",
          description: "Failed to add task to milestone. Check your network and try again.",
        });
      }
    },
    [toast, sendEvent, workspaceId]
  );

  // Apply parsed natural-language AI edit action from NLCommandBar
  const handleAIAction = useCallback(
    async (action: AIBoardAction) => {
      const { entity, id, changes } = action;

      if (action.action === "create") {
        if (entity === "goal") {
          const res = await fetch("/api/goals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              title: String(changes.title ?? "New Goal"),
              objective: String(changes.objective ?? changes.title ?? "Objective"),
              status: typeof changes.status === "string" ? changes.status : "active",
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? "Failed to create goal.");
          }
          const data = await res.json();
          setGoals((prev) => [...prev, data.goal]);
          const pos = getSpawnPosition("goal", 220, 130);
          const cardRes = await fetch("/api/board-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              entityType: "goal",
              x: pos.x,
              y: pos.y,
              width: 220,
              height: 130,
              linkedGoalId: data.goal.id,
            }),
          });
          if (cardRes.ok) {
            const cardData = await cardRes.json();
            addItem({ ...cardData.boardItem, linkedGoal: data.goal });
          }
        } else if (entity === "milestone") {
          const targetGoalId =
            (typeof changes.goalId === "string" && changes.goalId) || goals[0]?.id;
          if (!targetGoalId) throw new Error("Create a goal before creating a milestone.");
          const res = await fetch("/api/milestones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              goalId: targetGoalId,
              title: String(changes.title ?? "New Milestone"),
              status: typeof changes.status === "string" ? changes.status : "planned",
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? "Failed to create milestone.");
          }
          const data = await res.json();
          const createdMs: MilestoneWithTasks = { ...data.milestone, tasks: data.milestone.tasks ?? [] };
          setMilestones((prev) => [...prev, createdMs]);
          const pos = getSpawnPosition("milestone", 220, 130);
          const cardRes = await fetch("/api/board-items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              entityType: "milestone",
              x: pos.x,
              y: pos.y,
              width: 220,
              height: 130,
              linkedMilestoneId: createdMs.id,
              linkedGoalId: targetGoalId,
            }),
          });
          if (cardRes.ok) {
            const cardData = await cardRes.json();
            addItem({ ...cardData.boardItem, linkedMilestone: createdMs });
          }
        } else if (entity === "task") {
          const targetMilestoneId =
            (typeof changes.milestoneId === "string" && changes.milestoneId) || milestones[0]?.id;
          if (!targetMilestoneId) throw new Error("Create a milestone before creating a task.");
          const res = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              milestoneId: targetMilestoneId,
              title: String(changes.title ?? "New Task"),
              priority: typeof changes.priority === "string" ? changes.priority : "medium",
              assignees: Array.isArray(changes.assignees) ? changes.assignees : undefined,
              dueDate: typeof changes.dueDate === "string" ? changes.dueDate : undefined,
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error ?? "Failed to create task.");
          }
          const data = await res.json();
          useBoardStore.getState().addTaskToMilestone(targetMilestoneId, data.task);
          setMilestones((prev) =>
            prev.map((m) =>
              m.id === targetMilestoneId ? { ...m, tasks: [...(m.tasks ?? []), data.task] } : m
            )
          );
        }
      } else {
        // update / move / assign
        if (!id) {
          throw new Error(`AI could not identify which ${entity} to update. Please include its exact title.`);
        }
        const endpoint =
          entity === "goal"
            ? `/api/goals/${id}`
            : entity === "milestone"
            ? `/api/milestones/${id}`
            : `/api/tasks/${id}`;

        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Failed to update ${entity}.`);
        }
        router.refresh();
      }

      toast({
        type: "success",
        title: "Board updated",
        description: action.description,
      });
    },
    [workspaceId, goals, milestones, getSpawnPosition, addItem, router, toast]
  );

  // Position fingerprint for SVG connector memoization
  const positionFingerprint = useMemo(
    () =>
      items
        .map(
          (i) =>
            `${i.id}:${i.x},${i.y},${i.width},${i.height},${i.linkedGoalId ?? ""},${i.linkedMilestoneId ?? ""}`
        )
        .join("|"),
    [items]
  );

  const connectors = useMemo(() => {
    const goalCardByLinkedGoalId = new Map<string, BoardItemFull>();
    const msCardByLinkedMilestoneId = new Map<string, BoardItemFull>();

    for (const item of items) {
      if (item.entityType === "goal" && item.linkedGoalId) {
        goalCardByLinkedGoalId.set(item.linkedGoalId, item);
      }
      if (item.entityType === "milestone" && item.linkedMilestoneId) {
        msCardByLinkedMilestoneId.set(item.linkedMilestoneId, item);
      }
    }

    const result: { path: string; color: string; key: string }[] = [];

    for (const item of items) {
      if (item.entityType === "milestone") {
        const milestoneGoalId = item.linkedGoalId ?? item.linkedMilestone?.goalId ?? null;
        if (milestoneGoalId) {
          const goalCard = goalCardByLinkedGoalId.get(milestoneGoalId);
          if (goalCard) {
            result.push({ path: smartConnector(goalCard, item), color: "#6366f1", key: `ms-goal-${item.id}` });
          }
        }
      }
      if (item.entityType === "task" && item.linkedMilestoneId) {
        const msCard = msCardByLinkedMilestoneId.get(item.linkedMilestoneId);
        if (msCard) {
          result.push({ path: smartConnector(msCard, item), color: "#06b6d4", key: `task-ms-${item.id}` });
        }
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionFingerprint]);

  const selectedItem = selectedId
    ? (useBoardStore.getState().itemsById[selectedId] ?? null)
    : null;

  const canvasSize = useMemo(() => {
    if (items.length === 0) return { width: 2000, height: 1500 };
    let maxX = 0;
    let maxY = 0;
    for (const item of items) {
      const right = item.x + (item.width ?? 200);
      const bottom = item.y + (item.height ?? 120);
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    return {
      width: Math.max(2000, maxX + 600),
      height: Math.max(1500, maxY + 600),
    };
  }, [items]);

  return (
    <div
      className="relative w-full bg-white overflow-hidden rounded-2xl border border-border focus:outline-none"
      style={{ height: "calc(100dvh - 112px)", minHeight: "400px" }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="VisionBoard 2D canvas. Use arrow keys to pan when canvas is focused."
    >
      {/* Subtle non-blocking WebSocket connection status badge */}
      {(connectionState === "reconnecting" || connectionState === "offline") && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-3 left-3 z-20 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white/95 border border-border shadow-sm text-slate"
        >
          {connectionState === "reconnecting" ? (
            <>
              <RefreshCw size={12} className="animate-spin text-amber-500" aria-hidden="true" />
              <span>Reconnecting live sync…</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-danger" aria-hidden="true" />
              <span>Live sync offline</span>
              <button
                type="button"
                onClick={reconnect}
                className="text-blue font-semibold hover:underline cursor-pointer"
              >
                Retry
              </button>
            </>
          )}
        </div>
      )}

      <BoardToolbar
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(2, z + 0.1))}
        onZoomOut={() => setZoom((z) => Math.max(0.3, z - 0.1))}
        onZoomReset={() => {
          setZoom(1);
          setPan({ x: 0, y: 0 });
          panRef.current = { x: 0, y: 0 };
          zoomRef.current = 1;
          applyTransformDOM(0, 0, 1);
        }}
        workspaceId={workspaceId}
        goals={goals}
        milestones={milestones}
        currentItems={items}
        onItemAdded={addItem}
        onItemReconciled={handleItemReconciled}
        getSpawnPosition={getSpawnPosition}
        onGoalCreated={(goal) => setGoals((prev) => [...prev, goal])}
        onMilestoneCreated={(ms) => setMilestones((prev) => [...prev, ms])}
        onItemsSynced={(newItems) => {
          const existingIds = new Set(items.map((i) => i.id));
          const uniqueNew = (newItems as BoardItemFull[]).filter((i) => !existingIds.has(i.id));
          setItems([...items, ...uniqueNew]);
        }}
        activeCollaborators={activeCollaborators}
        sendEvent={sendEvent}
        layoutMode={layoutMode}
        onToggleLayoutSidePanel={() => setLayoutSidePanelOpen((prev) => !prev)}
        onOpenAICommand={() => setAiCommandOpen(true)}
      />

      {/* Board Layout Switcher Side Panel Drawer */}
      <BoardLayoutSidePanel
        isOpen={layoutSidePanelOpen}
        onClose={() => setLayoutSidePanelOpen(false)}
        currentLayout={layoutMode}
        onSelectLayout={(newLayout) => {
          changeLayoutMode(newLayout);
          setLayoutSidePanelOpen(false);
        }}
        columnCount={KANBAN_GROUPS.length}
        totalItemsCount={items.length}
      />

      {/* Natural Language AI Board Edit Command Bar */}
      {aiCommandOpen && (
        <NLCommandBar
          workspaceId={workspaceId}
          onClose={() => setAiCommandOpen(false)}
          onAction={handleAIAction}
        />
      )}

      {/* Main Board View: Kanban vs Canvas */}
      {layoutMode === "kanban" ? (
        <div className="absolute inset-0 overflow-auto no-scrollbar">
          <KanbanView
            workspaceId={workspaceId}
            items={items}
            goals={goals}
            milestones={milestones}
            members={members}
            selectedId={selectedId}
            onSelectCard={(id) => setSelectedId(selectedId === id ? null : id)}
            onItemAdded={addItem}
            onGoalCreated={(goal) => setGoals((prev) => [...prev, goal])}
            onMilestoneCreated={(ms) => setMilestones((prev) => [...prev, ms])}
            onItemStatusChange={handleItemStatusChange}
            onDeleteCard={handleDeleteCard}
            onTaskToggle={handleTaskToggle}
            onAddTaskToMilestone={handleAddTaskToMilestone}
            onSwitchToCanvas={() => changeLayoutMode("canvas")}
          />
        </div>
      ) : (
        /* Canvas area */
        <div
          ref={canvasRef}
          className="absolute inset-0 overflow-hidden touch-none"
          style={{ cursor: "grab" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/* Dot grid */}
          <div
            ref={gridRef}
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
            style={{
              backgroundImage: "radial-gradient(circle, #E2E8F0 1px, transparent 1px)",
              backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
              backgroundPosition: `${pan.x % (20 * zoom)}px ${pan.y % (20 * zoom)}px`,
            }}
          />

          {/* Transformed canvas */}
          <div
            ref={canvasTransformRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "absolute",
              width: canvasSize.width,
              height: canvasSize.height,
            }}
          >
            {/* Real-time remote cursors layer (inverse-scaled by zoom) */}
            <LiveCursorsCanvas currentUserId={currentUserId} zoom={zoom} />

            {/* SVG connector lines — overflow-visible ensures negative coordinates never clip */}
            {connectors.length > 0 && (
              <svg
                className="overflow-visible"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                  overflow: "visible",
                }}
                aria-hidden="true"
              >
                <defs>
                  <marker id="arrow-violet" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" opacity="0.75" />
                  </marker>
                  <marker id="arrow-cyan" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                    <path d="M0,0 L0,6 L8,3 z" fill="#06b6d4" opacity="0.75" />
                  </marker>
                </defs>
                {connectors.map((c) => (
                  <path
                    key={c.key}
                    d={c.path}
                    stroke={c.color}
                    strokeWidth={1.75}
                    strokeOpacity={0.6}
                    fill="none"
                    markerEnd={c.color === "#6366f1" ? "url(#arrow-violet)" : "url(#arrow-cyan)"}
                  />
                ))}
              </svg>
            )}

            <DndContext
              id="board-canvas-dnd"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {items.map((item) => (
                <BoardCard
                  key={item.id}
                  item={item}
                  zoom={zoom}
                  isSelected={selectedId === item.id}
                  remoteViewers={viewersByCard[item.id]}
                  onSelect={handleSelectCard}
                  onDelete={handleDeleteCard}
                />
              ))}
            </DndContext>
          </div>
        </div>
      )}

      {/* Side panel */}
      {selectedItem && (
        <CardDetailPanel
          key={selectedItem.id}
          item={selectedItem}
          goals={goals}
          milestones={milestones}
          members={members}
          sendEvent={sendEvent}
          onClose={() => setSelectedId(null)}
          onItemUpdated={(updated) => {
            updateBoardItem(updated.id, updated);
          }}
          onItemDeleted={handleDeleteCard}
          onItemStatusChange={handleItemStatusChange}
        />
      )}

      {/* Empty state — Canvas mode only */}
      {layoutMode === "canvas" && items.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <Kanban className="w-12 h-12 text-slate-300 mb-3 stroke-[1.5]" aria-hidden="true" />
          <h3 className="text-lg font-semibold text-ink">Your board is empty</h3>
          <p className="text-sm text-muted mt-1">
            Click &quot;+&quot; below to add a Goal, Milestone, or Note card
          </p>
        </div>
      )}

      {/* Undo Toast Notification — auto-dismisses after 10s, pauses on hover/focus */}
      {showUndoToast && lastDeleted && (
        <div
          role="status"
          aria-live="polite"
          onMouseEnter={() => setUndoToastHovered(true)}
          onMouseLeave={() => setUndoToastHovered(false)}
          onFocus={() => setUndoToastHovered(true)}
          onBlur={() => setUndoToastHovered(false)}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <RotateCcw size={14} className="text-blue-400 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-white capitalize">
              {lastDeleted.item.entityType}
            </strong>{" "}
            {lastDeleted.deletedEntity ? "deleted" : "removed from board"}
          </span>
          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-700 pl-3">
            <button
              type="button"
              onClick={handleUndo}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              Undo <span className="opacity-70 text-[10px] font-mono ml-0.5">Ctrl+Z</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUndoToast(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss undo notification"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Reset Child Tasks Confirmation Modal */}
      {pendingResetConfirmation && (
        <dialog
          ref={resetDialogRef}
          closedby="any"
          aria-labelledby="reset-child-tasks-title"
          className="m-auto bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-[calc(100%-2rem)] p-6 animate-in fade-in zoom-in-95 duration-150 backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
        >
          <div className="flex items-center gap-3 text-purple-600 mb-3">
            <div className="p-2.5 bg-purple-50 rounded-xl">
              <RotateCcw size={20} aria-hidden="true" />
            </div>
            <h1 id="reset-child-tasks-title" className="text-base font-bold text-slate-900">
              Reset Child Tasks?
            </h1>
          </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              You are moving{" "}
              <strong className="text-slate-900">
                &ldquo;{pendingResetConfirmation.milestoneTitle}&rdquo;
              </strong>{" "}
              back to TO DO. Do you want to reset all {pendingResetConfirmation.taskCount} child
              task{pendingResetConfirmation.taskCount > 1 ? "s" : ""} to TO DO as well, or keep
              their current statuses?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const pending = pendingResetConfirmation;
                  setPendingResetConfirmation(null);
                  handleItemStatusChange(pending.itemId, pending.newStatus, { cascadeTasks: true });
                }}
                className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                Reset All Tasks to TO DO
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = pendingResetConfirmation;
                  setPendingResetConfirmation(null);
                  handleItemStatusChange(pending.itemId, pending.newStatus, { cascadeTasks: false });
                }}
                className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Keep Current Task Statuses
              </button>
              <button
                ref={resetCancelRef}
                type="button"
                autoFocus
                onClick={() => setPendingResetConfirmation(null)}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors mt-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
        </dialog>
      )}
    </div>
  );
}
