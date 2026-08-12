"use client";

import { memo, useState, useCallback, useRef } from "react";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BoardItemFull } from "@/types/board";
import { CheckCircle2, Circle, Clock, AlertTriangle, GripVertical, Link2, Trash2 } from "lucide-react";

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 size={12} className="text-success" />,
  done: <CheckCircle2 size={12} className="text-success" />,
  in_progress: <Clock size={12} className="text-blue" />,
  blocked: <AlertTriangle size={12} className="text-danger" />,
  planned: <Circle size={12} className="text-muted" />,
  todo: <Circle size={12} className="text-muted" />,
};

const ENTITY_COLORS: Record<string, { border: string; header: string; badge: string }> = {
  goal:      { border: "border-blue/30",    header: "bg-blue",      badge: "bg-blue-faint text-blue" },
  milestone: { border: "border-violet-300", header: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  task:      { border: "border-cyan/40",    header: "bg-cyan",      badge: "bg-cyan/10 text-cyan" },
  note:      { border: "border-amber-300",  header: "bg-amber-400",  badge: "bg-amber-50 text-amber-700" },
};

import type { RemoteCursor } from "@/hooks/useWebSocket";

interface BoardCardProps {
  item: BoardItemFull;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: (id: string) => void;
  remoteViewers?: RemoteCursor[];
}

function BoardCardInner({ item, isSelected, onSelect, onDelete, remoteViewers = [] }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const [isReadyToMove, setIsReadyToMove] = useState(false);
  const [isPressing, setIsPressing] = useState(false);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Call dnd-kit pointer listeners if any
    listeners?.onPointerDown?.(e as never);
    setIsPressing(true);

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setIsReadyToMove(true);
      if (typeof window !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(35);
        } catch {}
      }
    }, 240);
  }, [listeners]);

  const handlePointerUpOrCancel = useCallback(() => {
    setIsPressing(false);
    setIsReadyToMove(false);
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const primaryViewer = remoteViewers[0];
  const activeMove = isDragging || isReadyToMove;

  const style: React.CSSProperties = {
    position: "absolute",
    left: item.x,
    top: item.y,
    width: item.width,
    minHeight: item.height,
    transform: CSS.Translate.toString(transform),
    zIndex: activeMove ? 100 : isSelected ? 10 : remoteViewers.length > 0 ? 5 : 1,
    opacity: isDragging ? 0.92 : 1,
    transition: isDragging ? "none" : "box-shadow 0.15s, border-color 0.2s, transform 0.15s",
    touchAction: "none",
    borderColor: primaryViewer ? primaryViewer.userColor : undefined,
  };

  const entity =
    item.entityType === "milestone"
      ? item.linkedMilestone
      : item.linkedGoal ?? item.linkedMilestone;
  const title = entity?.title ?? item.label ?? item.entityType;
  const status = (entity as { status?: string })?.status ?? "";
  const colors = ENTITY_COLORS[item.entityType] ?? ENTITY_COLORS.note;

  // Is this card linked to another entity?
  const isLinked = !!(item.linkedGoalId || item.linkedMilestoneId || item.linkedTaskId);

  // Milestone task progress
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
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrCancel}
      onPointerCancel={handlePointerUpOrCancel}
      className={`bg-white rounded-xl border-2 shadow-sm select-none group relative ${colors.border} ${
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
      onClick={onSelect}
    >
      {/* Draggable Active Indicator Badge */}
      {activeMove && (
        <div className="absolute -top-3.5 left-2 z-30 flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-white animate-bounce pointer-events-none">
          <GripVertical size={12} /> Ready to move
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
                <img
                  src={viewer.userImage}
                  alt={viewer.userName}
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

      {/* Drag handle header strip — visual affordance on desktop */}
      <div
        className={`${colors.header} h-1.5 rounded-t-lg relative`}
      >
        <GripVertical
          size={12}
          className="absolute right-1 -bottom-3.5 text-slate-400 opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none"
        />
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
                <Link2 size={10} className="text-slate-400" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {status && (
              <span className="flex items-center gap-1">
                {STATUS_ICON[status]}
              </span>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all pointer-events-auto"
                title="Delete card"
              >
                <Trash2 size={12} />
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

        {/* Hover hint */}
        {!isDragging && (
          <p className="mt-2 text-[9px] text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
            Click to edit · Drag to move · Hold on mobile
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Memoised board card — only re-renders when this card's own data, selection
 * state, or click handler changes. Prevents 500-card re-renders on unrelated
 * state changes (e.g. another card's task status update).
 */
export const BoardCard = memo(BoardCardInner);

