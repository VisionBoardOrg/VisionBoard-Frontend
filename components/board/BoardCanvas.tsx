"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { BoardCard } from "./BoardCard";
import { BoardToolbar } from "./BoardToolbar";
import { NLCommandBar } from "./NLCommandBar";
import { CardDetailPanel } from "./CardDetailPanel";
import { LiveCursorsCanvas } from "./LiveCursorsCanvas";
import { BoardLayoutSidePanel, type BoardLayoutMode } from "./BoardLayoutSidePanel";
import { KanbanView } from "./KanbanView";
import { Kanban, RotateCcw, X } from "lucide-react";
import type { BoardItemFull, GoalSimple, MilestoneWithTasks, UserSimple, TaskSimple } from "@/types/board";
import { useBoard } from "@/store/board-store";
import { useCursorStore } from "@/store/cursor-store";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/context/ToastContext";

// ── Module-level pure functions — defined outside the component so they are
// stable references and do not cause useMemo dependencies to change every render.

type Point = { x: number; y: number };
type Edge = "right" | "left" | "bottom" | "top";

const COLOR_PALETTE = [
  "#2563EB", "#10B981", "#F59E0B", "#EC4899", "#8B5CF6", "#06B6D4", "#F97316", "#14B8A6"
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
    right: { x: CTRL, y: 0 }, left: { x: -CTRL, y: 0 },
    bottom: { x: 0, y: CTRL }, top: { x: 0, y: -CTRL },
  };
  const c1 = { x: p1.x + offsets[best.srcEdge].x, y: p1.y + offsets[best.srcEdge].y };
  const c2 = { x: p2.x + offsets[best.tgtEdge].x, y: p2.y + offsets[best.tgtEdge].y };
  return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
}

interface BoardCanvasProps {
  workspaceId: string;
  initialItems: BoardItemFull[];
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  members: UserSimple[];
}

export function BoardCanvas({ workspaceId, initialItems, goals: initialGoals, milestones: initialMilestones, members }: BoardCanvasProps) {
  const { items, moveItem, setItems } = useBoard(workspaceId, initialItems);
  const { toast } = useToast();

  // Read current logged-in user session for presence broadcasting
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const currentUserName = session?.user?.name || "Teammate";
  const currentUserImage = session?.user?.image;
  const currentUserColor = useMemo(() => getUserColor(currentUserId), [currentUserId]);

  // ── Single WebSocket instance for this board session ─────────────────────
  // Remote cursors are written to useCursorStore (not local state) so the
  // 25Hz cursor stream only re-renders the cursor overlay — never this tree.
  const { sendEvent } = useWebSocket(workspaceId);
  const viewersByCard = useCursorStore((s) => s.viewersByCard);
  const activeCollaborators = useCursorStore((s) => s.activeUsers);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<BoardLayoutMode>("canvas");
  const [layoutSidePanelOpen, setLayoutSidePanelOpen] = useState(false);

  // Restore saved layout preference from localStorage after mount
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(`visionboard_layout_${workspaceId}`) ||
        localStorage.getItem("visionboard_preferred_layout");
      if (saved === "kanban" || saved === "canvas") {
        setLayoutMode(saved as BoardLayoutMode);
      }
    } catch { }
  }, [workspaceId]);

  // Persist layout selection to localStorage whenever changed
  const changeLayoutMode = useCallback(
    (mode: BoardLayoutMode) => {
      setLayoutMode(mode);
      try {
        localStorage.setItem(`visionboard_layout_${workspaceId}`, mode);
        localStorage.setItem("visionboard_preferred_layout", mode);
      } catch { }
    },
    [workspaceId]
  );
  // Goals and milestones are kept in state so newly created ones appear immediately
  const [goals, setGoals] = useState<GoalSimple[]>(initialGoals);
  const [milestones, setMilestones] = useState<MilestoneWithTasks[]>(initialMilestones);
  const [undoStack, setUndoStack] = useState<{ item: BoardItemFull; deletedAt: number }[]>([]);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const lastDeleted = undoStack[undoStack.length - 1];
  const canvasRef = useRef<HTMLDivElement>(null);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  // Panning with mouse drag on canvas background
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const lastCursorEmitRef = useRef<number>(0);
  // Identity is sent on the first cursor packet after connect and then every
  // 25th (~1/sec) — keeps 40ms position packets minimal while letting
  // newcomers learn who is who without a presence-join protocol.
  const cursorPacketCountRef = useRef(0);
  // rAF coalescing for pan updates — one setState per frame max instead of
  // one per mousemove event
  const panRafRef = useRef<number | null>(null);
  const pendingPanRef = useRef({ x: 0, y: 0 });

  const applyPan = useCallback((dx: number, dy: number) => {
    pendingPanRef.current = {
      x: pendingPanRef.current.x + dx,
      y: pendingPanRef.current.y + dy,
    };
    if (panRafRef.current === null) {
      panRafRef.current = requestAnimationFrame(() => {
        panRafRef.current = null;
        const delta = pendingPanRef.current;
        pendingPanRef.current = { x: 0, y: 0 };
        setPan((prev) => ({ x: prev.x + delta.x, y: prev.y + delta.y }));
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (panRafRef.current !== null) cancelAnimationFrame(panRafRef.current);
    };
  }, []);

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

    // Broadcast mouse position in canvas coordinates (throttled to ~25fps / 40ms)
    if (currentUserId && canvasRef.current) {
      const now = Date.now();
      if (now - lastCursorEmitRef.current >= 40) {
        lastCursorEmitRef.current = now;
        cursorPacketCountRef.current += 1;
        const includeIdentity = cursorPacketCountRef.current % 25 === 1;
        const rect = canvasRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / zoom;
        const canvasY = (e.clientY - rect.top - pan.y) / zoom;

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
    isPanning.current = false;
    (e.currentTarget as HTMLDivElement).style.cursor = "grab";
  }

  // Touch panning
  const touchOnCard = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    const onCard = !!(e.target as HTMLElement).closest("[data-board-card]");
    touchOnCard.current = onCard;
    if (onCard) return;
    if (e.touches.length !== 1) return;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isPanning.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isPanning.current || touchOnCard.current) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    applyPan(dx, dy);
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function onTouchEnd() {
    isPanning.current = false;
    touchOnCard.current = false;
  }

  // Wheel to zoom
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((prev) => Math.min(2, Math.max(0.3, prev - e.deltaY * 0.001)));
  }

  // Keyboard shortcut for the AI command bar + Escape to close panel.
  // ⌘/ opens the board AI command bar — ⌘K is reserved app-wide for the
  // global command palette in AppShell (both used to fire at once here).
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "?")) {
      e.preventDefault();
      setCommandOpen(true);
    }
    if (e.key === "Escape") {
      setSelectedId(null);
      setCommandOpen(false);
    }
  }

  // Persist drag — debounced 400 ms
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const itemId = active.id as string;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const newX = item.x + delta.x / zoom;
      const newY = item.y + delta.y / zoom;

      moveItem(itemId, newX, newY);

      // Broadcast card move to other WebSocket clients immediately
      sendEvent({
        type: "CARD_UPDATED",
        workspaceId,
        boardItem: { ...item, x: newX, y: newY },
      });

      // Debounce DB write
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        fetch(`/api/board-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: newX, y: newY }),
        });
      }, 400);
    },
    [items, zoom, moveItem, sendEvent, workspaceId]
  );

  const handleDragStart = useCallback(() => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(35);
      } catch { }
    }
  }, []);

  const handleDeleteCard = useCallback(
    async (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      // Add to undo stack & show toast
      setUndoStack((prev) => [...prev, { item, deletedAt: Date.now() }]);
      setShowUndoToast(true);

      // Optimistically remove card
      setItems(items.filter((i) => i.id !== itemId));
      if (selectedId === itemId) setSelectedId(null);

      // Broadcast over WS
      if (sendEvent && workspaceId) {
        sendEvent({
          type: "CARD_DELETED",
          workspaceId,
          id: itemId,
        });
      }

      try {
        if (item.entityType === "goal" && item.linkedGoalId) {
          await fetch(`/api/goals/${item.linkedGoalId}`, { method: "DELETE" });
        } else if (item.entityType === "milestone" && item.linkedMilestoneId) {
          await fetch(`/api/milestones/${item.linkedMilestoneId}`, { method: "DELETE" });
        }
        await fetch(`/api/board-items/${itemId}`, { method: "DELETE" });
      } catch (err) {
        console.error("[BoardCanvas] Failed to delete board item:", err);
      }
    },
    [items, selectedId, sendEvent, workspaceId, setItems]
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

    // Put item back into state
    setItems([...items.filter((i) => i.id !== restoredItem.id), restoredItem]);

    // Broadcast over WS
    if (sendEvent && workspaceId) {
      sendEvent({
        type: "CARD_CREATED",
        workspaceId,
        boardItem: restoredItem,
      });
    }

    try {
      let restoredMilestoneId = restoredItem.linkedMilestoneId;
      let restoredGoalId = restoredItem.linkedGoalId;

      if (restoredItem.entityType === "milestone" && restoredItem.linkedMilestone) {
        const ms = restoredItem.linkedMilestone;
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
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.milestone?.id) {
              restoredMilestoneId = data.milestone.id;

              // Restore tasks if any — all requests in parallel (was a serial N+1 loop)
              if (ms.tasks && ms.tasks.length > 0) {
                await Promise.allSettled(
                  ms.tasks.map((t) =>
                    fetch(`/api/tasks`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        milestoneId: restoredMilestoneId,
                        title: t.title,
                        priority: t.priority ?? "medium",
                        assigneeId: t.assigneeId,
                        dueDate: t.dueDate ?? new Date().toISOString(),
                      }),
                    }).catch(console.error)
                  )
                );
              }
            }
          }
        }
      } else if (restoredItem.entityType === "goal" && restoredItem.linkedGoal) {
        const g = restoredItem.linkedGoal;
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
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.goal?.id) restoredGoalId = data.goal.id;
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

      if (resBoardItem.ok) {
        const data = await resBoardItem.json();
        if (data.boardItem) {
          setItems([...items.filter((i) => i.id !== restoredItem.id), data.boardItem]);
          if (sendEvent && workspaceId) {
            sendEvent({
              type: "CARD_CREATED",
              workspaceId,
              boardItem: data.boardItem,
            });
          }
        }
      }
    } catch (err) {
      console.error("[BoardCanvas] Failed to restore deleted item:", err);
    }
  }, [goals, items, undoStack, workspaceId, sendEvent, setItems]);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
      if (activeTag === "input" || activeTag === "textarea" || isEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Zoom keyboard shortcuts (canvas layout only) — + / - / 0 to reset
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
        }
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleUndo, layoutMode]);

  const handleItemStatusChange = useCallback(
    async (itemId: string, newStatus: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      // Revert the optimistic local update if the server rejects the change
      const reportFailure = () => {
        if (item.entityType === "goal" && item.linkedGoalId) {
          const oldStatus = goals.find((g) => g.id === item.linkedGoalId)?.status;
          setGoals((prev) =>
            prev.map((g) => (g.id === item.linkedGoalId ? { ...g, status: oldStatus ?? g.status } : g))
          );
        } else if (item.entityType === "milestone" && item.linkedMilestoneId) {
          const oldStatus = milestones.find((m) => m.id === item.linkedMilestoneId)?.status;
          setMilestones((prev) =>
            prev.map((m) => (m.id === item.linkedMilestoneId ? { ...m, status: oldStatus ?? m.status } : m))
          );
        }
        toast({
          type: "error",
          title: "Couldn't save status change",
          description: `Moving “${item.label ?? item.entityType}” to ${newStatus.replace("_", " ")} failed. The change was reverted — please try again.`,
        });
      };

      try {
        if (item.entityType === "goal" && item.linkedGoalId) {
          setGoals((prev) =>
            prev.map((g) => (g.id === item.linkedGoalId ? { ...g, status: newStatus } : g))
          );
          const res = await fetch(`/api/goals/${item.linkedGoalId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) reportFailure();
        } else if (item.entityType === "milestone" && item.linkedMilestoneId) {
          setMilestones((prev) =>
            prev.map((m) => (m.id === item.linkedMilestoneId ? { ...m, status: newStatus } : m))
          );
          const res = await fetch(`/api/milestones/${item.linkedMilestoneId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) reportFailure();
        } else if (item.entityType === "task" && item.linkedTaskId) {
          const res = await fetch(`/api/tasks/${item.linkedTaskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!res.ok) reportFailure();
        }
      } catch {
        reportFailure();
      }

      if (sendEvent) {
        sendEvent({
          type: "CARD_UPDATED",
          workspaceId,
          boardItem: item,
        });
      }
    },
    [items, goals, milestones, workspaceId, sendEvent, setGoals, setMilestones, toast]
  );

  const handleTaskToggle = useCallback(
    async (taskId: string, newStatus: string, milestoneId?: string) => {
      // Apply a task status (and its cascading milestone status) to local state
      const applyTaskStatus = (status: string) => {
        if (milestoneId) {
          setMilestones((prev) =>
            prev.map((m) => {
              if (m.id === milestoneId) {
                const mTasks = m.tasks ?? [];
                const updatedTasks = mTasks.map((t: TaskSimple) => (t.id === taskId ? { ...t, status } : t));
                const allDone = updatedTasks.length > 0 && updatedTasks.every((t: TaskSimple) => t.status === "done");
                const anyStarted = updatedTasks.some((t: TaskSimple) => t.status === "done" || t.status === "in_progress" || t.status === "in_review");
                const newMilestoneStatus = allDone ? "completed" : anyStarted ? "in_progress" : "planned";
                return { ...m, status: newMilestoneStatus, tasks: updatedTasks };
              }
              return m;
            })
          );
          setItems(
            items.map((item) => {
              if (item.entityType === "milestone" && item.linkedMilestoneId === milestoneId && item.linkedMilestone) {
                const mTasks = item.linkedMilestone.tasks ?? [];
                const updatedTasks = mTasks.map((t: TaskSimple) => (t.id === taskId ? { ...t, status } : t));
                const allDone = updatedTasks.length > 0 && updatedTasks.every((t: TaskSimple) => t.status === "done");
                const anyStarted = updatedTasks.some((t: TaskSimple) => t.status === "done" || t.status === "in_progress" || t.status === "in_review");
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
        items.find((i) => i.linkedMilestoneId === milestoneId)?.linkedMilestone?.tasks?.find((t) => t.id === taskId)?.status ??
        "todo";

      applyTaskStatus(newStatus);

      try {
        const res = await fetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error(`PATCH failed with ${res.status}`);
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
    [items, milestones, setMilestones, setItems, toast]
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
        if (res.ok) {
          const data = await res.json();
          const newTask = data.task;
          setMilestones((prev) =>
            prev.map((m) => (m.id === milestoneId ? { ...m, tasks: [...m.tasks, newTask] } : m))
          );
          setItems(
            items.map((item) => {
              if (item.entityType === "milestone" && item.linkedMilestoneId === milestoneId && item.linkedMilestone) {
                return {
                  ...item,
                  linkedMilestone: {
                    ...item.linkedMilestone,
                    tasks: [...(item.linkedMilestone.tasks ?? []), newTask],
                  },
                };
              }
              return item;
            })
          );
        }
      } catch (err) {
        console.error("Failed to add task to milestone:", err);
      }
    },
    [items, setMilestones, setItems]
  );

  // Remote viewers per card and online-collaborator identity come from the
  // cursor store with stable object identity — they only change when the set
  // of viewers/members changes, not on every cursor position packet.

  // SVG connector lines
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
  }, [items]);

  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items]
  );
  const selectedItem = selectedId ? (itemsById.get(selectedId) ?? null) : null;

  return (
    <div
      className="relative w-full bg-white overflow-hidden rounded-2xl border border-border"
      style={{ height: "calc(100dvh - 112px)", minHeight: "400px" }}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="VisionBoard 2D canvas"
    >
      <BoardToolbar
        zoom={zoom}
        onZoomIn={() => setZoom((z) => Math.min(2, z + 0.1))}
        onZoomOut={() => setZoom((z) => Math.max(0.3, z - 0.1))}
        onZoomReset={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        onCommandOpen={() => setCommandOpen(true)}
        workspaceId={workspaceId}
        goals={goals}
        milestones={milestones}
        currentItems={items}
        onItemAdded={(item) => setItems([...items, item])}
        onGoalCreated={(goal) => setGoals((prev) => [...prev, goal])}
        onMilestoneCreated={(ms) => setMilestones((prev) => [...prev, ms])}
        onItemsSynced={(newItems) => {
          setItems([...items, ...(newItems as BoardItemFull[])]);
        }}
        activeCollaborators={activeCollaborators}
        sendEvent={sendEvent}
        layoutMode={layoutMode}
        onToggleLayoutSidePanel={() => setLayoutSidePanelOpen((prev) => !prev)}
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
        columnCount={3}
        totalItemsCount={items.length}
      />

      {/* Main Board View: Kanban vs Canvas — full
          height now that the toolbar floats at the bottom */}
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
            onItemAdded={(item) => setItems([...items, item])}
            onItemStatusChange={handleItemStatusChange}
            onDeleteCard={handleDeleteCard}
            onTaskToggle={handleTaskToggle}
            onAddTaskToMilestone={handleAddTaskToMilestone}
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
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Dot grid background */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
            <defs>
              <pattern id="dots" x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)} width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={1} fill="#E2E8F0" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dots)" />
          </svg>

          {/* Transformed canvas */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "absolute",
              width: 4000,
              height: 3000,
            }}
          >
            {/* Real-time remote cursors layer */}
            <LiveCursorsCanvas currentUserId={currentUserId} />

            {/* SVG connector lines */}
            {connectors.length > 0 && (
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                aria-hidden
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

            <DndContext id="board-canvas-dnd" sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              {items.map((item) => (
                <BoardCard
                  key={item.id}
                  item={item}
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

      {/* Side panel — slides in from right, overlays canvas */}
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
            setItems(items.map((i) => (i.id === updated.id ? updated : i)));
          }}
          onItemDeleted={handleDeleteCard}
        />
      )}

      {/* Command bar overlay */}
      {commandOpen && (
        <NLCommandBar
          workspaceId={workspaceId}
          onClose={() => setCommandOpen(false)}
          onAction={async (action) => {
            if (!action.id) return;

            // Apply the AI-parsed action immediately after user confirmation
            if (action.entity === "milestone" || action.entity === "task") {
              if (action.action === "update" || action.action === "assign" || action.action === "move") {
                // Optimistically update the board store
                setItems(
                  items.map((item) => {
                    if (
                      (item.entityType === "milestone" && item.linkedMilestoneId === action.id) ||
                      (item.entityType === "goal" && item.linkedGoalId === action.id)
                    ) {
                      return { ...item, ...(action.changes as Partial<typeof item>) };
                    }
                    return item;
                  })
                );

                // Persist to API
                const endpoint =
                  action.entity === "task"
                    ? `/api/tasks/${action.id}`
                    : `/api/milestones/${action.id}`;

                fetch(endpoint, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(action.changes),
                }).catch((err) =>
                  console.error("[NL Board Edit] Failed to persist action:", err)
                );
              }
            }

            if (action.entity === "goal" && action.id) {
              fetch(`/api/board-items/${action.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action.changes),
              }).catch((err) =>
                console.error("[NL Board Edit] Failed to persist goal action:", err)
              );
            }
          }}
        />
      )}

      {/* Empty state — only displayed in Canvas mode */}
      {layoutMode === "canvas" && items.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <Kanban className="w-12 h-12 text-slate-300 mb-3 stroke-[1.5]" />
          <h3 className="text-lg font-semibold text-ink">Your board is empty</h3>
          <p className="text-sm text-muted mt-1">Click &quot;+&quot; to add a Goal, Milestone, or Note card</p>
        </div>
      )}

      {/* Undo Toast Notification — floats above the bottom toolbar */}
      {showUndoToast && lastDeleted && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-900 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <RotateCcw size={14} className="text-blue-400 shrink-0" />
          <span>
            <strong className="font-semibold text-white capitalize">{lastDeleted.item.entityType}</strong> deleted
          </span>
          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-700 pl-3">
            <button
              onClick={handleUndo}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            >
              Undo <span className="opacity-70 text-[10px] font-mono ml-0.5">Ctrl+Z</span>
            </button>
            <button
              onClick={() => setShowUndoToast(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
