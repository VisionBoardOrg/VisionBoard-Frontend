"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { BoardItemFull } from "@/types/board";
import { CheckCircle2, Circle, Clock, AlertTriangle, GripVertical, Link2 } from "lucide-react";

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

interface BoardCardProps {
  item: BoardItemFull;
  isSelected: boolean;
  onSelect: () => void;
}

export function BoardCard({ item, isSelected, onSelect }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    position: "absolute",
    left: item.x,
    top: item.y,
    width: item.width,
    minHeight: item.height,
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 100 : isSelected ? 10 : 1,
    opacity: isDragging ? 0.85 : 1,
    transition: isDragging ? "none" : "box-shadow 0.15s",
  };

  const entity = item.linkedGoal ?? item.linkedMilestone;
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
      className={`bg-white rounded-xl border-2 shadow-sm select-none transition-shadow group ${colors.border} ${
        isSelected ? "ring-2 ring-blue ring-offset-2 shadow-md" : "hover:shadow-md"
      } ${isDragging ? "shadow-primary" : ""}`}
      onClick={onSelect}
    >
      {/* Drag handle header strip — grip icon appears on hover */}
      <div
        {...attributes}
        {...listeners}
        className={`${colors.header} h-1.5 rounded-t-lg cursor-grab active:cursor-grabbing relative`}
      >
        <GripVertical
          size={12}
          className="absolute right-1 -bottom-3.5 text-slate-400 opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none"
        />
      </div>

      <div className="p-3">
        {/* Entity type badge + link indicator + status */}
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
          {status && (
            <span className="flex items-center gap-1">
              {STATUS_ICON[status]}
            </span>
          )}
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
            Click to edit · Drag strip to move
          </p>
        )}
      </div>
    </div>
  );
}
