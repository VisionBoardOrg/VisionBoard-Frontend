"use client";

import { memo, useState, useCallback } from "react";
import Image from "next/image";
import { useDraggable } from "@dnd-kit/core";
import type { BoardItemFull } from "@/types/board";
import type { RemoteCursor } from "@/hooks/useWebSocket";
import { CheckCircle2, Circle, Clock, AlertTriangle, GripVertical, Link2, Trash2 } from "lucide-react";

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={12} className="text-success" aria-label="Completed" />,
  done: <CheckCircle2 size={12} className="text-success" aria-label="Done" />,
  in_progress: <Clock size={12} className="text-blue" aria-label="In Progress" />,
  delayed: <AlertTriangle size={12} className="text-amber-500" aria-label="Delayed" />,
  blocked: <AlertTriangle size={12} className="text-danger" aria-label="Blocked" />,
  planned: <Circle size={12} className="text-muted" aria-label="Planned" />,
  todo: <Circle size={12} className="text-muted" aria-label="To Do" />,
};

const ENTITY_COLORS: Record<string, { border: string; header: string; badge: string }> = {
  goal:      { border: "border-blue/30",    header: "bg-blue",       badge: "bg-blue-faint text-blue" },
  milestone: { border: "border-violet-300", header: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  task:      { border: "border-cyan/40",    header: "bg-cyan",       badge: "bg-cyan/10 text-cyan" },
  note:      { border: "border-amber-300",  header: "bg-amber-400",  badge: "bg-amber-50 text-amber-700" },
};

interface BoardCardProps {
  item: BoardItemFull;
  zoom?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  remoteViewers?: RemoteCursor[];
}

function BoardCardInner({
  item,
  zoom = 1,
  isSelected,
  onSelect,
  onDelete,
  remoteViewers = [],
}: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const handleClick = useCallback(() => {
    onSelect(item.id);
  }, [onSelect, item.id]);

  const [isPressing, setIsPressing] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      listeners?.onPointerDown?.(e as never);
      setIsPressing(true);
    },
    [listeners]
  );

  const handlePointerUpOrCancel = useCallback(() => {
    setIsPressing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (!isDragging && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onSelect(item.id);
        return;
      }
      listeners?.onKeyDown?.(e as never);
    },
    [isDragging, item.id, listeners, onSelect]
  );

  const primaryViewer = remoteViewers[0];
  const activeMove = isDragging;
  const safeZoom = zoom || 1;

  const style: React.CSSProperties = {
    position: "absolute",
    left: item.x,
    top: item.y,
    width: item.width,
    minHeight: item.height,
    // Scale live drag delta by 1/zoom so cards track the pointer 1:1 and never teleport on drop
    transform: transform
      ? `translate3d(${transform.x / safeZoom}px, ${transform.y / safeZoom}px, 0)`
      : undefined,
    zIndex: activeMove ? 100 : isSelected ? 10 : remoteViewers.length > 0 ? 5 : 1,
    opacity: isDragging ? 0.94 : 1,
    transition: isDragging
      ? "none"
      : "box-shadow 0.15s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.15s, transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)",
    willChange: isDragging ? "transform" : "auto",
    touchAction: "none",
    borderColor: primaryViewer ? primaryViewer.userColor : undefined,
  };

  const entity =
    item.entityType === "milestone"
      ? item.linkedMilestone
      : item.linkedGoal ?? item.linkedMilestone;
  const title = entity?.title ?? item.label ?? item.entityType;

  // Respect explicit milestone.status so Canvas and Kanban always agree
  let status = (entity as { status?: string })?.status ?? "";
  if (item.entityType === "milestone" && item.linkedMilestone) {
    const stored = (item.linkedMilestone.status || "").toLowerCase();
    if (stored === "completed" || stored === "done" || stored === "complete") {
      status = "completed";
    } else if (stored === "in_progress" || stored === "active") {
      status = "in_progress";
    } else if (stored === "delayed" || stored === "blocked") {
      status = "delayed";
    } else {
      status = "planned";
    }
  }

  const colors = ENTITY_COLORS[item.entityType] ?? ENTITY_COLORS.note;
  const isLinked = !!(item.linkedGoalId || item.linkedMilestoneId || item.linkedTaskId);

  let taskProgress: { done: number; total: number } | null = null;
  if (item.entityType === "milestone" && item.linkedMilestone) {
    const tasks = item.linkedMilestone.tasks ?? [];
    taskProgress = {
      done: tasks.filter((t) => t.status === "done").length,
      total: tasks.length,
    };
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-board-card
      {...attributes}
      {...listeners}
      tabIndex={0}
      aria-label={`${item.entityType}: ${title}. Press Enter to inspect details.`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      onKeyDown={handleKeyDown}
      className={`bg-white rounded-xl border-2 shadow-sm select-none group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue ${colors.border} ${
        activeMove
          ? "ring-4 ring-blue-500 shadow-2xl scale-[1.04] cursor-grabbing z-50 bg-blue-50/20"
          : isPressing
          ? "scale-[0.98] ring-2 ring-blue-400/50 cursor-grab"
          : isSelected
          ? "ring-2 ring-blue ring-offset-2 shadow-md cursor-grab active:scale-[0.98]"
          : primaryViewer
          ? "ring-2 ring-offset-1 shadow-md cursor-grab active:scale-[0.98]"
          : "hover:shadow-md cursor-grab active:scale-[0.98]"
      }`}
      onClick={handleClick}
    >
      {/* Draggable Active Indicator Badge */}
      {activeMove && (
        <div className="absolute -top-3.5 left-2 z-30 flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white pointer-events-none">
          <GripVertical size={12} aria-hidden="true" /> Moving
        </div>
      )}

      {/* Remote Viewers Avatar Stack Badge */}
      {remoteViewers.length > 0 && (
        <div className="absolute -top-3 right-2 z-20 flex items-center -space-x-1.5 pointer-events-none">
          {remoteViewers.map((viewer) => (
            <div
              key={viewer.userId}
              className="relative group/viewer"
              title={`${viewer.userName} is viewing`}
            >
              {viewer.userImage ? (
                <Image
                  src={viewer.userImage}
                  alt={viewer.userName}
                  width={20}
                  height={20}
                  sizes="20px"
                  className="w-5 h-5 rounded-full object-cover border-2 border-white shadow-sm"
                  style={{ borderColor: viewer.userColor }}
                />
              ) : (
                <span
                  className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center border-2 border-white shadow-sm uppercase"
                  style={{ backgroundColor: viewer.userColor }}
                >
                  {viewer.userName.charAt(0)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Header strip + keyboard-accessible drag handle */}
      <div className={`${colors.header} h-1.5 rounded-t-lg relative`}>
        <button
          type="button"
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Drag ${title} with keyboard arrows`}
          title="Drag to move"
          className="absolute right-1 top-2 p-0.5 rounded text-slate-400 opacity-0 group-hover:opacity-80 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue cursor-grab"
        >
          <GripVertical size={12} aria-hidden="true" />
        </button>
      </div>

      <div className="p-3">
        {/* Entity type badge + link indicator + status + delete button */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${colors.badge}`}>
              {item.entityType}
            </span>
            {isLinked && (
              <span title="Linked">
                <Link2 size={10} className="text-slate-400" aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 pr-3">
            {status && (
              <span className="flex items-center gap-1" title={status.replace("_", " ")}>
                {STATUS_ICON[status]}
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all pointer-events-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                title={
                  item.entityType === "goal" || item.entityType === "milestone"
                    ? `Remove or delete ${item.entityType}`
                    : "Delete card"
                }
                aria-label={`Delete ${title}`}
              >
                <Trash2 size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-ink leading-tight mb-1">{title}</h3>

        {/* Milestone task progress bar */}
        {taskProgress && taskProgress.total > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted">{taskProgress.done}/{taskProgress.total} tasks</span>
              <span className="text-[10px] font-semibold text-ink">
                {Math.round((taskProgress.done / taskProgress.total) * 100)}%
              </span>
            </div>
            <div className="h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-blue rounded-full transition-all"
                style={{ width: `${(taskProgress.done / taskProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Goal target date */}
        {item.linkedGoal?.targetDate && (
          <div className="mt-2 text-[10px] text-muted">
            Target: {new Date(item.linkedGoal.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        )}

        {/* Interaction hint — touch devices see tap/hold hint directly; desktop reveals on hover */}
        {!isDragging && (
          <>
            <p className="mt-2 text-[9px] text-slate-400 md:hidden">
              Tap to edit · Hold to move
            </p>
            <p className="mt-2 text-[9px] text-slate-400 hidden md:block opacity-0 group-hover:opacity-100 transition-opacity">
              Click to edit · Drag to move
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Memoised board card — only re-renders when this card's own data, zoom,
 * selection state, or remote viewers change.
 */
export const BoardCard = memo(BoardCardInner, (prev, next) => {
  if (prev.item !== next.item) return false;
  if (prev.zoom !== next.zoom) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.onSelect !== next.onSelect) return false;
  if (prev.onDelete !== next.onDelete) return false;

  const prevViewers = prev.remoteViewers;
  const nextViewers = next.remoteViewers;
  if (prevViewers === nextViewers) return true;
  if (!prevViewers && !nextViewers) return true;
  if (!prevViewers || !nextViewers) return false;
  if (prevViewers.length !== nextViewers.length) return false;
  for (let i = 0; i < prevViewers.length; i++) {
    if (
      prevViewers[i].userId !== nextViewers[i].userId ||
      prevViewers[i].userColor !== nextViewers[i].userColor ||
      prevViewers[i].userName !== nextViewers[i].userName ||
      prevViewers[i].userImage !== nextViewers[i].userImage
    ) {
      return false;
    }
  }
  return true;
});
