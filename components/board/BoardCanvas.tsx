"use client";

import { useState, useRef, useCallback } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
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

export function BoardCanvas({ workspaceId, initialItems, goals, milestones, members }: BoardCanvasProps) {
  const { items, moveItem, setItems } = useBoard(workspaceId, initialItems);
  const { sendEvent } = useWebSocket(workspaceId);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [commandOpen, setCommandOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // dnd-kit sensor — requires 8px drag threshold to prevent accidental drags on click
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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

  // ── SVG connector lines between linked items ───────────────────────────────
  // Build a map: itemId → centre point
  function itemCentre(item: BoardItemFull) {
    return {
      x: item.x + (item.width ?? 200) / 2,
      y: item.y + (item.height ?? 120) / 2,
    };
  }

  // Draw a line from each milestone card to its goal card (if goal card exists on canvas)
  // and from each task card to its milestone card (if milestone card exists on canvas)
  const connectors: { x1: number; y1: number; x2: number; y2: number; color: string; key: string }[] = [];

  for (const item of items) {
    if (item.entityType === "milestone" && item.linkedGoalId) {
      const goalCard = items.find(
        (i) => i.entityType === "goal" && i.linkedGoalId === item.linkedGoalId
      );
      if (goalCard) {
        const a = itemCentre(item);
        const b = itemCentre(goalCard);
        connectors.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: "#6366f1", key: `ms-goal-${item.id}` });
      }
    }
    if (item.entityType === "task" && item.linkedMilestoneId) {
      const msCard = items.find(
        (i) => i.entityType === "milestone" && i.linkedMilestoneId === item.linkedMilestoneId
      );
      if (msCard) {
        const a = itemCentre(item);
        const b = itemCentre(msCard);
        connectors.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: "#06b6d4", key: `task-ms-${item.id}` });
      }
    }
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div
      className="relative w-full bg-white overflow-hidden rounded-2xl border border-border"
      style={{ height: "calc(100vh - 112px)" }}
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
        onItemAdded={(item) => setItems([...items, item])}
      />

      {/* Canvas area */}
      <div
        ref={canvasRef}
        className="absolute inset-0 overflow-hidden"
        style={{ cursor: "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
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
                <marker id="arrow-violet" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#6366f1" opacity="0.6" />
                </marker>
                <marker id="arrow-cyan" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#06b6d4" opacity="0.6" />
                </marker>
              </defs>
              {connectors.map((c) => (
                <line
                  key={c.key}
                  x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
                  stroke={c.color}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  strokeOpacity={0.5}
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
        />
      )}

      {/* Command bar overlay */}
      {commandOpen && (
        <NLCommandBar
          workspaceId={workspaceId}
          onClose={() => setCommandOpen(false)}
          onAction={(action) => {
            console.log("AI action pending confirmation:", action);
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
