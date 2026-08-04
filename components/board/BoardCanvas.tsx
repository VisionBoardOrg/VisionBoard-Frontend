"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { BoardCard } from "./BoardCard";
import { BoardToolbar } from "./BoardToolbar";
import { NLCommandBar } from "./NLCommandBar";
import { CardDetailPanel } from "./CardDetailPanel";
import { Kanban } from "lucide-react";
import type { BoardItemFull, GoalSimple, MilestoneWithTasks, UserSimple } from "@/types/board";
import { useBoard } from "@/store/board-store";
import { useWebSocket } from "@/hooks/useWebSocket";

interface BoardCanvasProps {
  workspaceId: string;
  initialItems: BoardItemFull[];
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  members: UserSimple[];
}

export function BoardCanvas({ workspaceId, initialItems, goals: initialGoals, milestones: initialMilestones, members }: BoardCanvasProps) {
  const { items, moveItem, setItems } = useBoard(workspaceId, initialItems);
  const { sendEvent } = useWebSocket(workspaceId);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Goals and milestones are kept in state so newly created ones appear immediately
  const [goals, setGoals] = useState<GoalSimple[]>(initialGoals);
  const [milestones, setMilestones] = useState<MilestoneWithTasks[]>(initialMilestones);
  const canvasRef = useRef<HTMLDivElement>(null);

  // dnd-kit sensors:
  // - PointerSensor (mouse/stylus): 8px drag threshold to prevent accidental drags on click
  // - TouchSensor: 250ms long-press delay before drag activates on mobile
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  // Panning with mouse drag on canvas background
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-board-card]")) return;
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLDivElement).style.cursor = "grabbing";
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  }

  function onMouseUp(e: React.MouseEvent) {
    isPanning.current = false;
    (e.currentTarget as HTMLDivElement).style.cursor = "grab";
  }

  // Touch panning — only activates when the touch did NOT start on a card.
  // Card touches are handled by dnd-kit's TouchSensor after the long-press delay.
  const touchOnCard = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    const onCard = !!(e.target as HTMLElement).closest("[data-board-card]");
    touchOnCard.current = onCard;
    if (onCard) return; // let dnd-kit handle card drags
    if (e.touches.length !== 1) return;
    lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    isPanning.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!isPanning.current || touchOnCard.current) return;
    if (e.touches.length !== 1) return;
    e.preventDefault(); // prevent native scroll while panning the canvas
    const dx = e.touches[0].clientX - lastPos.current.x;
    const dy = e.touches[0].clientY - lastPos.current.y;
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
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

  // Keyboard shortcut for command bar + Escape to close panel
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCommandOpen(true);
    }
    if (e.key === "Escape") {
      setSelectedId(null);
      setCommandOpen(false);
    }
  }

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, delta } = event;
      const itemId = active.id as string;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const newX = item.x + delta.x / zoom;
      const newY = item.y + delta.y / zoom;

      moveItem(itemId, newX, newY);

      // Broadcast card move to other WebSocket clients
      sendEvent({
        type: "CARD_UPDATED",
        workspaceId,
        boardItem: { ...item, x: newX, y: newY },
      });

      // Persist to backend
      fetch(`/api/board-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: newX, y: newY }),
      });
    },
    [items, zoom, moveItem, sendEvent, workspaceId]
  );

  // ── SVG connector lines — O(N) with Map lookups instead of O(N²) finds ───
  type Point = { x: number; y: number };
  type Edge = "right" | "left" | "bottom" | "top";

  function cardEdges(item: BoardItemFull): Record<Edge, Point> {
    const w = item.width  ?? 200;
    const h = item.height ?? 120;
    return {
      right:  { x: item.x + w,     y: item.y + h / 2 },
      left:   { x: item.x,         y: item.y + h / 2 },
      bottom: { x: item.x + w / 2, y: item.y + h     },
      top:    { x: item.x + w / 2, y: item.y          },
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
      right:  { x:  CTRL, y: 0 }, left: { x: -CTRL, y: 0 },
      bottom: { x: 0, y:  CTRL }, top:  { x: 0, y: -CTRL },
    };
    const c1 = { x: p1.x + offsets[best.srcEdge].x, y: p1.y + offsets[best.srcEdge].y };
    const c2 = { x: p2.x + offsets[best.tgtEdge].x, y: p2.y + offsets[best.tgtEdge].y };
    return `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }

  // Memoised connectors: only recompute when items array changes (not on pan/zoom).
  // Uses Maps for O(N) lookups instead of O(N²) Array.find() calls.
  const connectors = useMemo(() => {
    // Build lookup maps once — O(N)
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
  }, [items]); // smartConnector is defined in render scope but is pure — items is the only dep that matters
  // ─────────────────────────────────────────────────────────────────────────

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

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
      />

      {/* Canvas area */}
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
          {/* SVG connector lines — drawn under the cards */}
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

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {items.map((item) => (
              <BoardCard
                key={item.id}
                item={item}
                isSelected={selectedId === item.id}
                onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
              />
            ))}
          </DndContext>
        </div>
      </div>

      {/* Side panel — slides in from right, overlays canvas */}
      {selectedItem && (
        <CardDetailPanel
          key={selectedItem.id}
          item={selectedItem}
          goals={goals}
          milestones={milestones}
          members={members}
          onClose={() => setSelectedId(null)}
          onItemUpdated={(updated) => {
            setItems(items.map((i) => (i.id === updated.id ? updated : i)));
          }}
          onItemDeleted={(deletedId) => {
            setItems(items.filter((i) => i.id !== deletedId));
            setSelectedId(null);
          }}
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

      {/* Empty state */}
      {items.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <Kanban className="w-12 h-12 text-slate-300 mb-3 stroke-[1.5]" />
          <h3 className="text-lg font-semibold text-ink">Your board is empty</h3>
          <p className="text-sm text-muted mt-1">Click &quot;+&quot; to add a Goal, Milestone, or Note card</p>
        </div>
      )}
    </div>
  );
}
