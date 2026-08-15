"use client";

import { useState, useMemo } from "react";
import {
  CircleDashed,
  CircleDot,
  CheckCircle2,
  Plus,
  MoreHorizontal,
  Trash2,
  CheckSquare,
  Square,
  Milestone as MilestoneIcon,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import type { BoardItemFull, GoalSimple, MilestoneWithTasks, UserSimple } from "@/types/board";
import { DndContext, useDraggable, useDroppable, DragEndEvent } from "@dnd-kit/core";

export interface StatusGroup {
  id: string;
  name: string;
  badgeBg: string;
  badgeText: string;
  badgeIcon: React.ReactNode;
  addTaskColor: string;
  headerIcons?: boolean;
  statuses: string[];
}

const DEFAULT_GROUPS: StatusGroup[] = [
  {
    id: "todo",
    name: "TO DO",
    badgeBg: "bg-slate-200/80 text-slate-700",
    badgeText: "text-slate-700",
    badgeIcon: <CircleDashed size={14} className="text-slate-500" />,
    addTaskColor: "text-slate-500 hover:text-slate-800",
    statuses: ["todo", "planned", "draft"],
  },
  {
    id: "in_progress",
    name: "IN PROGRESS",
    badgeBg: "bg-purple-600 text-white",
    badgeText: "text-white",
    badgeIcon: <CircleDot size={14} className="text-white" />,
    addTaskColor: "text-purple-600 hover:text-purple-800",
    headerIcons: true,
    statuses: ["in_progress", "active", "in_review"],
  },
  {
    id: "complete",
    name: "COMPLETE",
    badgeBg: "bg-emerald-600 text-white",
    badgeText: "text-white",
    badgeIcon: <CheckCircle2 size={14} className="text-white" />,
    addTaskColor: "text-emerald-600 hover:text-emerald-800",
    statuses: ["complete", "completed", "done"],
  },
];

interface KanbanViewProps {
  workspaceId: string;
  items: BoardItemFull[];
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  members: UserSimple[];
  selectedId: string | null;
  onSelectCard: (id: string) => void;
  onItemAdded: (item: BoardItemFull) => void;
  onItemStatusChange: (itemId: string, newStatus: string) => void;
  onDeleteCard: (id: string) => void;
  onTaskToggle?: (taskId: string, newStatus: string, milestoneId?: string) => void;
  onAddTaskToMilestone?: (milestoneId: string, title: string) => void;
}

export function KanbanView({
  workspaceId,
  items,
  goals,
  milestones,
  members,
  selectedId,
  onSelectCard,
  onItemAdded,
  onItemStatusChange,
  onDeleteCard,
  onTaskToggle,
  onAddTaskToMilestone,
}: KanbanViewProps) {
  const [groups, setGroups] = useState<StatusGroup[]>(DEFAULT_GROUPS);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingTaskColumn, setAddingTaskColumn] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  // Map items to column groups based on status (hiding goals & notes)
  const itemsByGroup = useMemo(() => {
    const map = new Map<string, BoardItemFull[]>();
    for (const group of groups) {
      map.set(group.id, []);
    }

    for (const item of items) {
      // User directive: Do not show goals or notes in status column layout
      if (item.entityType === "goal" || item.entityType === "note") {
        continue;
      }

      let rawStatus = "todo";

      if (item.entityType === "milestone" && item.linkedMilestone) {
        const tasks = item.linkedMilestone.tasks ?? [];
        if (tasks.length > 0) {
          const allDone = tasks.every((t) => t.status === "done");
          const anyStarted = tasks.some((t) => t.status === "done" || t.status === "in_progress" || t.status === "in_review");
          if (allDone) {
            rawStatus = "completed";
          } else if (anyStarted) {
            rawStatus = "in_progress";
          } else {
            rawStatus = (item.linkedMilestone.status || "planned").toLowerCase();
          }
        } else {
          rawStatus = (item.linkedMilestone.status || "planned").toLowerCase();
        }
      } else {
        const entity = item.linkedGoal ?? item.linkedMilestone;
        rawStatus = ((entity as { status?: string })?.status ?? item.label ?? "todo").toLowerCase();
      }

      let placed = false;
      for (const group of groups) {
        if (group.statuses.includes(rawStatus) || rawStatus === group.id) {
          map.get(group.id)?.push(item);
          placed = true;
          break;
        }
      }

      // Fallback to To Do group if not explicitly matched
      if (!placed) {
        const defaultGroup = map.get("todo") ?? map.get(groups[0]?.id);
        defaultGroup?.push(item);
      }
    }
    return map;
  }, [items, groups]);

  // Handle Drag End in Kanban columns
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const itemId = active.id as string;
    const targetGroupId = over.id as string;

    const targetGroup = groups.find((g) => g.id === targetGroupId);
    if (!targetGroup) return;

    const targetStatus =
      targetGroupId === "todo"
        ? "todo"
        : targetGroupId === "in_progress"
        ? "in_progress"
        : targetGroupId === "complete"
        ? "done"
        : targetGroup.statuses[0] || targetGroupId;

    onItemStatusChange(itemId, targetStatus);
  }

  // Create quick task inside a column
  async function handleQuickAddTask(groupId: string) {
    if (!newTaskTitle.trim()) return;

    const title = newTaskTitle.trim();
    setNewTaskTitle("");
    setAddingTaskColumn(null);

    const status =
      groupId === "todo"
        ? "todo"
        : groupId === "in_progress"
        ? "in_progress"
        : groupId === "complete"
        ? "done"
        : groupId;

    try {
      const defaultMilestone = milestones[0];
      if (defaultMilestone) {
        const res = await fetch(`/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            milestoneId: defaultMilestone.id,
            status,
            priority: "medium",
          }),
        });
        if (res.ok) {
          const taskData = await res.json();
          const boardRes = await fetch(`/api/board-items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              entityType: "task",
              x: 100,
              y: 100,
              width: 220,
              height: 120,
              linkedTaskId: taskData.task.id,
              linkedMilestoneId: defaultMilestone.id,
            }),
          });
          if (boardRes.ok) {
            const data = await boardRes.json();
            onItemAdded(data.boardItem);
          }
        }
      }
    } catch (err) {
      console.error("Failed to add task:", err);
    }
  }

  // Create new status column group
  function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    const groupName = newGroupName.trim();
    const id = groupName.toLowerCase().replace(/\s+/g, "_");

    const newGroup: StatusGroup = {
      id,
      name: groupName.toUpperCase(),
      badgeBg: "bg-slate-700 text-white",
      badgeText: "text-white",
      badgeIcon: <CircleDot size={14} className="text-white" />,
      addTaskColor: "text-slate-600 hover:text-slate-900",
      statuses: [id],
    };

    setGroups([...groups, newGroup]);
    setNewGroupName("");
    setAddingGroup(false);
  }

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="w-full h-full min-h-[550px] p-6 overflow-x-auto bg-slate-50/50 flex items-start gap-6 select-none no-scrollbar">
        {groups.map((group) => {
          const columnItems = itemsByGroup.get(group.id) ?? [];
          return (
            <KanbanColumn
              key={group.id}
              group={group}
              items={columnItems}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              onDeleteCard={onDeleteCard}
              addingTaskColumn={addingTaskColumn}
              setAddingTaskColumn={setAddingTaskColumn}
              newTaskTitle={newTaskTitle}
              setNewTaskTitle={setNewTaskTitle}
              onQuickAddTask={handleQuickAddTask}
              onTaskToggle={onTaskToggle}
              onAddTaskToMilestone={onAddTaskToMilestone}
            />
          );
        })}

        {/* Far Right + Add group Button / Input */}
        <div className="shrink-0 pt-1">
          {addingGroup ? (
            <form onSubmit={handleAddGroup} className="bg-white p-3 rounded-xl border border-slate-200 shadow-md w-64">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Column group name..."
                autoFocus
                className="w-full text-xs font-medium px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 transition-colors"
                >
                  Add Group
                </button>
                <button
                  type="button"
                  onClick={() => setAddingGroup(false)}
                  className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-semibold rounded-md hover:bg-slate-200"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setAddingGroup(true)}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-medium text-sm px-3.5 py-2 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <Plus size={16} /> Add group
            </button>
          )}
        </div>
      </div>
    </DndContext>
  );
}

// ── Column Drop Zone Component ──────────────────────────────────────────────
interface KanbanColumnProps {
  group: StatusGroup;
  items: BoardItemFull[];
  selectedId: string | null;
  onSelectCard: (id: string) => void;
  onDeleteCard: (id: string) => void;
  addingTaskColumn: string | null;
  setAddingTaskColumn: (id: string | null) => void;
  newTaskTitle: string;
  setNewTaskTitle: (val: string) => void;
  onQuickAddTask: (groupId: string) => void;
  onTaskToggle?: (taskId: string, newStatus: string, milestoneId?: string) => void;
  onAddTaskToMilestone?: (milestoneId: string, title: string) => void;
}

function KanbanColumn({
  group,
  items,
  selectedId,
  onSelectCard,
  onDeleteCard,
  addingTaskColumn,
  setAddingTaskColumn,
  newTaskTitle,
  setNewTaskTitle,
  onQuickAddTask,
  onTaskToggle,
  onAddTaskToMilestone,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id });

  return (
    <div
      ref={setNodeRef}
      className={`w-80 shrink-0 bg-slate-100/70 rounded-2xl p-4 border transition-colors flex flex-col gap-3 min-h-[480px] ${
        isOver ? "border-purple-400 bg-purple-50/40 ring-2 ring-purple-400/20" : "border-slate-200/70"
      }`}
    >
      {/* Column Header matching exact design in screenshot */}
      <div className="flex items-center justify-between min-h-[32px]">
        <div className="flex items-center gap-2">
          {/* Status Badge Pill */}
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide flex items-center gap-1.5 shadow-2xs ${group.badgeBg}`}>
            {group.badgeIcon}
            <span>{group.name}</span>
          </div>
          {/* Item Count Badge */}
          <span className="text-xs font-semibold text-slate-500 pl-0.5">{items.length}</span>
        </div>

        {/* Optional Header Action Buttons */}
        {group.headerIcons && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAddingTaskColumn(group.id)}
              className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100/60 rounded-md transition-colors"
              title="Add task"
            >
              <Plus size={16} />
            </button>
            <button
              className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100/60 rounded-md transition-colors"
              title="Column options"
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Card Items Container */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-0.5 no-scrollbar">
        {items.map((item) => (
          <KanbanCardItem
            key={item.id}
            item={item}
            isSelected={selectedId === item.id}
            onSelect={() => onSelectCard(item.id)}
            onDelete={() => onDeleteCard(item.id)}
            onTaskToggle={onTaskToggle}
            onAddTaskToMilestone={onAddTaskToMilestone}
          />
        ))}

        {items.length === 0 && !addingTaskColumn && (
          <div className="flex-1 flex items-center justify-center p-6 border-2 border-dashed border-slate-200/80 rounded-xl text-xs text-slate-400 font-medium">
            Drop cards here
          </div>
        )}
      </div>

      {/* Inline Add Task Input Form */}
      {addingTaskColumn === group.id ? (
        <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm mt-1">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Enter task title..."
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onQuickAddTask(group.id);
              }
              if (e.key === "Escape") setAddingTaskColumn(null);
            }}
            className="w-full text-xs font-medium px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setAddingTaskColumn(null)}
              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onQuickAddTask(group.id)}
              className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        /* Bottom + Add Task Button matching image design per column */
        <button
          onClick={() => setAddingTaskColumn(group.id)}
          className={`flex items-center gap-1.5 font-medium text-xs py-2 px-2.5 rounded-lg hover:bg-slate-200/50 transition-colors w-full text-left mt-1 ${group.addTaskColor}`}
        >
          <Plus size={15} /> Add Task
        </button>
      )}
    </div>
  );
}

// ── Expandable Milestone Kanban Card Item ───────────────────────────────────
interface KanbanCardItemProps {
  item: BoardItemFull;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTaskToggle?: (taskId: string, newStatus: string, milestoneId?: string) => void;
  onAddTaskToMilestone?: (milestoneId: string, title: string) => void;
}

function KanbanCardItem({
  item,
  isSelected,
  onSelect,
  onDelete,
  onTaskToggle,
  onAddTaskToMilestone,
}: KanbanCardItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const milestone = item.linkedMilestone;
  const title = milestone?.title ?? item.label ?? `${item.entityType.toUpperCase()} item`;
  const tasks = milestone?.tasks ?? [];

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const totalCount = tasks.length;
  const percent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim() || !milestone) return;
    const taskTitle = newTaskTitle.trim();
    setNewTaskTitle("");
    setAddingTask(false);
    onAddTaskToMilestone?.(milestone.id, taskTitle);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative ${
        isSelected ? "ring-2 ring-purple-600 border-purple-600" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        {/* Milestone Entity Badge */}
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
          <MilestoneIcon size={11} />
          Milestone
        </span>

        {/* Delete Milestone Action */}
        {confirmDelete ? (
          <div
            className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-semibold animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span className="text-[10px]">Delete?</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
                onDelete();
              }}
              className="bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs transition-colors"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(false);
              }}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
              title="Cancel"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
            title="Delete milestone"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Milestone Title */}
      <h4 className="text-xs font-semibold text-slate-900 leading-snug">{title}</h4>

      {/* Progress Bar & Expand/Collapse Toggle Header */}
      <div
        className="mt-3 pt-2 border-t border-slate-100 cursor-pointer"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((prev) => !prev);
        }}
      >
        <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-purple-600 transition-colors">
            {isExpanded ? (
              <ChevronDown size={14} className="text-purple-600 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-400 shrink-0" />
            )}
            <span>
              {doneCount}/{totalCount} tasks
            </span>
            <span className="text-[10px] text-slate-400 font-normal">({percent}%)</span>
          </div>
        </div>

        {/* Progress bar track */}
        {totalCount > 0 && (
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                percent === 100 ? "bg-emerald-500" : "bg-purple-600"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      {/* Expanded Task List View */}
      {isExpanded && (
        <div
          className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>Milestone Tasks ({tasks.length})</span>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setAddingTask(true);
              }}
              className="text-purple-600 hover:text-purple-800 flex items-center gap-0.5 text-[10px] font-semibold"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {tasks.map((task) => {
            const isDone = task.status === "done";
            return (
              <div
                key={task.id}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskToggle?.(task.id, isDone ? "todo" : "done", milestone?.id);
                }}
                className="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-50 border border-slate-100 hover:border-purple-200 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isDone ? (
                    <CheckSquare size={14} className="text-emerald-600 shrink-0" />
                  ) : (
                    <Square size={14} className="text-slate-300 shrink-0 hover:text-purple-500" />
                  )}
                  <span
                    className={`text-xs text-slate-700 truncate ${
                      isDone ? "line-through text-slate-400" : "font-medium"
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Quick inline task creation inside expanded milestone */}
          {addingTask ? (
            <form onSubmit={handleCreateTask} className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="New task title..."
                autoFocus
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-2 py-1 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700"
              >
                Add
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingTask(false);
                }}
                className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setAddingTask(true);
              }}
              className="mt-1 text-[11px] text-slate-400 hover:text-purple-600 flex items-center gap-1 py-1 px-1.5 rounded hover:bg-slate-50 w-full font-medium"
            >
              <Plus size={13} /> Add task to milestone
            </button>
          )}
        </div>
      )}
    </div>
  );
}
