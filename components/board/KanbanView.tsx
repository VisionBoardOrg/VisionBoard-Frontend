"use client";

import { useState, useMemo } from "react";
import {
  CircleDashed,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Milestone as MilestoneIcon,
  ChevronDown,
  ChevronRight,
  Search,
  LayoutGrid,
  Loader2,
  X,
} from "lucide-react";
import type { BoardItemFull, GoalSimple, MilestoneWithTasks, UserSimple } from "@/types/board";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useToast } from "@/context/ToastContext";
import { SingleLineOverflow } from "@/components/ui/SingleLineOverflow";
import { useConfirm } from "@/context/ConfirmContext";

export interface StatusGroup {
  id: string;
  name: string;
  targetMilestoneStatus: "planned" | "in_progress" | "delayed" | "completed";
  badgeBg: string;
  badgeText: string;
  badgeIcon: React.ReactNode;
  addTaskColor: string;
  headerIcons?: boolean;
  statuses: string[];
}

export const KANBAN_GROUPS: StatusGroup[] = [
  {
    id: "todo",
    name: "TO DO",
    targetMilestoneStatus: "planned",
    badgeBg: "bg-slate-200/80 text-slate-700",
    badgeText: "text-slate-700",
    badgeIcon: <CircleDashed size={14} className="text-slate-500" aria-hidden="true" />,
    addTaskColor: "text-slate-500 hover:text-slate-800",
    statuses: ["todo", "planned", "draft"],
  },
  {
    id: "in_progress",
    name: "IN PROGRESS",
    targetMilestoneStatus: "in_progress",
    badgeBg: "bg-purple-600 text-white",
    badgeText: "text-white",
    badgeIcon: <CircleDot size={14} className="text-white" aria-hidden="true" />,
    addTaskColor: "text-purple-600 hover:text-purple-800",
    headerIcons: true,
    statuses: ["in_progress", "active", "in_review"],
  },
  {
    id: "delayed",
    name: "DELAYED",
    targetMilestoneStatus: "delayed",
    badgeBg: "bg-amber-500 text-white",
    badgeText: "text-white",
    badgeIcon: <AlertTriangle size={14} className="text-white" aria-hidden="true" />,
    addTaskColor: "text-amber-700 hover:text-amber-900",
    statuses: ["delayed", "blocked"],
  },
  {
    id: "complete",
    name: "COMPLETE",
    targetMilestoneStatus: "completed",
    badgeBg: "bg-emerald-600 text-white",
    badgeText: "text-white",
    badgeIcon: <CheckCircle2 size={14} className="text-white" aria-hidden="true" />,
    addTaskColor: "text-emerald-600 hover:text-emerald-800",
    statuses: ["complete", "completed", "done"],
  },
];

const TASK_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  in_progress: { label: "In Progress", className: "bg-blue-50 text-blue-700 border-blue-200" },
  in_review: { label: "In Review", className: "bg-violet-50 text-violet-700 border-violet-200" },
  blocked: { label: "Blocked", className: "bg-red-50 text-red-700 border-red-200" },
};

interface KanbanViewProps {
  workspaceId: string;
  items: BoardItemFull[];
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  members: UserSimple[];
  selectedId: string | null;
  onSelectCard: (id: string) => void;
  onItemAdded: (item: BoardItemFull) => void;
  onGoalCreated?: (goal: GoalSimple) => void;
  onMilestoneCreated?: (milestone: MilestoneWithTasks) => void;
  onItemStatusChange: (itemId: string, newStatus: string) => void;
  onDeleteCard: (id: string) => void;
  onTaskToggle?: (taskId: string, newStatus: string, milestoneId?: string) => void;
  onAddTaskToMilestone?: (milestoneId: string, title: string) => void;
  onSwitchToCanvas?: () => void;
}

export function KanbanView({
  workspaceId,
  items,
  goals,
  selectedId,
  onSelectCard,
  onItemAdded,
  onGoalCreated,
  onMilestoneCreated,
  onItemStatusChange,
  onDeleteCard,
  onTaskToggle,
  onAddTaskToMilestone,
  onSwitchToCanvas,
}: KanbanViewProps) {
  const { toast } = useToast();
  const [addingMilestoneColumn, setAddingMilestoneColumn] = useState<string | null>(null);
  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [selectedQuickAddGoalId, setSelectedQuickAddGoalId] = useState<string>("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [goalFilterId, setGoalFilterId] = useState<string>("all");

  const effectiveGoalId = selectedQuickAddGoalId || goals[0]?.id || "";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  );

  // Count non-milestone items (Goals & Notes) so we can show a clear info banner
  const hiddenCanvasItemCount = useMemo(
    () => items.filter((i) => i.entityType === "goal" || i.entityType === "note").length,
    [items]
  );

  // Map filtered items to column groups based on status (hiding goals & notes)
  const itemsByGroup = useMemo(() => {
    const map = new Map<string, BoardItemFull[]>();
    for (const group of KANBAN_GROUPS) {
      map.set(group.id, []);
    }

    const q = searchQuery.trim().toLowerCase();

    for (const item of items) {
      if (item.entityType === "goal" || item.entityType === "note") {
        continue;
      }

      // Apply search & goal filters
      if (goalFilterId !== "all") {
        const itemGoalId = item.linkedMilestone?.goalId ?? item.linkedGoalId;
        if (itemGoalId !== goalFilterId) continue;
      }
      if (q) {
        const titleText = (item.linkedMilestone?.title ?? item.label ?? "").toLowerCase();
        const taskMatch = (item.linkedMilestone?.tasks ?? []).some((t) =>
          t.title.toLowerCase().includes(q)
        );
        if (!titleText.includes(q) && !taskMatch) continue;
      }

      let rawStatus = "planned";

      if (item.entityType === "milestone" && item.linkedMilestone) {
        const stored = (item.linkedMilestone.status || "planned").toLowerCase();
        if (stored === "completed" || stored === "done" || stored === "complete") {
          rawStatus = "completed";
        } else if (stored === "in_progress" || stored === "active" || stored === "doing") {
          rawStatus = "in_progress";
        } else if (stored === "delayed" || stored === "blocked") {
          rawStatus = "delayed";
        } else {
          rawStatus = "planned";
        }
      } else {
        const entity = item.linkedGoal ?? item.linkedMilestone;
        rawStatus = ((entity as { status?: string })?.status ?? item.label ?? "todo").toLowerCase();
      }

      let placed = false;
      for (const group of KANBAN_GROUPS) {
        if (group.statuses.includes(rawStatus) || rawStatus === group.id) {
          map.get(group.id)?.push(item);
          placed = true;
          break;
        }
      }

      if (!placed) {
        map.get("todo")?.push(item);
      }
    }
    return map;
  }, [items, searchQuery, goalFilterId]);

  const activeDragItem = useMemo(
    () => (activeDragId ? items.find((i) => i.id === activeDragId) ?? null : null),
    [activeDragId, items]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(event.active.id as string);
  }

  function handleDragCancel() {
    setActiveDragId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const itemId = active.id as string;
    const targetGroupId = over.id as string;

    const targetGroup = KANBAN_GROUPS.find((g) => g.id === targetGroupId);
    if (!targetGroup) return;

    onItemStatusChange(itemId, targetGroup.targetMilestoneStatus);
  }

  // Compute non-overlapping Canvas coordinates when adding a milestone from Kanban
  function nextCanvasMilestonePosition(): { x: number; y: number } {
    const colX = 380;
    const colItems = items.filter((i) => Math.abs(i.x - colX) < 40);
    if (colItems.length === 0) return { x: colX, y: 80 };
    const maxBottom = Math.max(...colItems.map((i) => i.y + (i.height ?? 130)));
    return { x: colX, y: maxBottom + 30 };
  }

  async function handleQuickAddMilestone(groupId: string) {
    const title = newMilestoneTitle.trim();
    if (!title || creatingMilestone) return;

    const group = KANBAN_GROUPS.find((g) => g.id === groupId);
    const status = group?.targetMilestoneStatus ?? "planned";

    setCreatingMilestone(true);
    try {
      let targetGoalId = effectiveGoalId;

      if (!targetGoalId) {
        const goalRes = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            title: "General Objectives",
            objective: "Default workspace goal for milestones",
            status: "active",
          }),
        });
        if (!goalRes.ok) {
          const errData = await goalRes.json().catch(() => ({}));
          toast({
            type: "error",
            title: "Could not create default goal",
            description: errData.error ?? "Please create a goal first.",
          });
          return;
        }
        const goalData = await goalRes.json();
        targetGoalId = goalData.goal.id;
        onGoalCreated?.(goalData.goal);
      }

      if (!targetGoalId) return;

      const res = await fetch(`/api/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          goalId: targetGoalId,
          title,
          status,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({
          type: "error",
          title: "Could not create milestone",
          description: errData.error ?? "Failed to create milestone. Please try again.",
        });
        return;
      }

      const milestoneData = await res.json();
      const createdMilestone: MilestoneWithTasks = {
        ...milestoneData.milestone,
        tasks: milestoneData.milestone.tasks ?? [],
      };
      onMilestoneCreated?.(createdMilestone);

      const { x, y } = nextCanvasMilestonePosition();
      const boardRes = await fetch(`/api/board-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          entityType: "milestone",
          x,
          y,
          width: 220,
          height: 130,
          linkedMilestoneId: createdMilestone.id,
          linkedGoalId: targetGoalId,
        }),
      });

      if (!boardRes.ok) {
        toast({
          type: "error",
          title: "Milestone created, card failed",
          description: "The milestone was saved, but adding its board card failed. Click 'Sync missing cards' to display it.",
        });
        return;
      }

      const data = await boardRes.json();
      onItemAdded({
        ...data.boardItem,
        linkedMilestone: createdMilestone,
      });
      setNewMilestoneTitle("");
      setAddingMilestoneColumn(null);
    } catch {
      toast({
        type: "error",
        title: "Connection error",
        description: "Failed to create milestone. Check your network and try again.",
      });
    } finally {
      setCreatingMilestone(false);
    }
  }

  return (
    <div className="w-full min-h-full bg-slate-50/50 flex flex-col">
      {/* Kanban Header Bar: Search, Goal Filter, and Canvas Info Notice */}
      <div className="px-6 pt-4 pb-2 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search filter */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search
              size={14}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter milestones or tasks…"
              aria-label="Filter milestones or tasks"
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Goal filter */}
          {goals.length > 0 && (
            <select
              aria-label="Filter by goal"
              value={goalFilterId}
              onChange={(e) => setGoalFilterId(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400 max-w-[220px] cursor-pointer"
            >
              <option value="all">All Goals ({goals.length})</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}

          {(searchQuery || goalFilterId !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setGoalFilterId("all");
              }}
              className="text-xs font-medium text-purple-600 hover:text-purple-800 px-2 py-1 rounded-lg hover:bg-purple-50 transition-colors cursor-pointer"
            >
              Reset filters
            </button>
          )}
        </div>

        {/* Subtle info bar when Goals or Notes exist on the board */}
        {hiddenCanvasItemCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 text-xs text-slate-600">
            <span>
              Kanban tracks milestones by status. Switch to Canvas view to arrange goals and notes ({hiddenCanvasItemCount} hidden).
            </span>
            {onSwitchToCanvas && (
              <button
                type="button"
                onClick={onSwitchToCanvas}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                <LayoutGrid size={12} aria-hidden="true" />
                Switch to Canvas
              </button>
            )}
          </div>
        )}
      </div>

      {/* Kanban Columns */}
      <DndContext
        id="kanban-view-dnd"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        {/* pb-24 keeps column content clear of the bottom floating toolbar */}
        <div className="flex-1 w-full min-h-[500px] px-6 pt-3 pb-24 overflow-x-auto flex items-start gap-5 select-none no-scrollbar">
          {KANBAN_GROUPS.map((group) => {
            const columnItems = itemsByGroup.get(group.id) ?? [];
            return (
              <KanbanColumn
                key={group.id}
                group={group}
                items={columnItems}
                goals={goals}
                selectedGoalId={effectiveGoalId}
                onSelectGoal={setSelectedQuickAddGoalId}
                selectedId={selectedId}
                onSelectCard={onSelectCard}
                onDeleteCard={onDeleteCard}
                addingMilestoneColumn={addingMilestoneColumn}
                setAddingMilestoneColumn={setAddingMilestoneColumn}
                creatingMilestone={creatingMilestone}
                newMilestoneTitle={newMilestoneTitle}
                setNewMilestoneTitle={setNewMilestoneTitle}
                onQuickAddMilestone={handleQuickAddMilestone}
                onTaskToggle={onTaskToggle}
                onAddTaskToMilestone={onAddTaskToMilestone}
              />
            );
          })}
        </div>

        {/* DragOverlay floats dragged cards cleanly above overflow-y-auto columns */}
        <DragOverlay dropAnimation={null}>
          {activeDragItem ? (
            <div className="w-[286px] bg-white p-3.5 rounded-xl border-2 border-purple-500 shadow-2xl cursor-grabbing rotate-[1deg]">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200 mb-2">
                <MilestoneIcon size={11} aria-hidden="true" />
                Milestone
              </span>
              <h4 className="text-xs font-semibold text-slate-900 leading-snug">
                {activeDragItem.linkedMilestone?.title ?? activeDragItem.label ?? "Milestone"}
              </h4>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── Column Drop Zone Component ──────────────────────────────────────────────
interface KanbanColumnProps {
  group: StatusGroup;
  items: BoardItemFull[];
  goals: GoalSimple[];
  selectedGoalId?: string;
  onSelectGoal: (goalId: string) => void;
  selectedId: string | null;
  onSelectCard: (id: string) => void;
  onDeleteCard: (id: string) => void;
  addingMilestoneColumn: string | null;
  setAddingMilestoneColumn: (id: string | null) => void;
  creatingMilestone: boolean;
  newMilestoneTitle: string;
  setNewMilestoneTitle: (val: string) => void;
  onQuickAddMilestone: (groupId: string) => void;
  onTaskToggle?: (taskId: string, newStatus: string, milestoneId?: string) => void;
  onAddTaskToMilestone?: (milestoneId: string, title: string) => void;
}

function KanbanColumn({
  group,
  items,
  goals,
  selectedGoalId,
  onSelectGoal,
  selectedId,
  onSelectCard,
  onDeleteCard,
  addingMilestoneColumn,
  setAddingMilestoneColumn,
  creatingMilestone,
  newMilestoneTitle,
  setNewMilestoneTitle,
  onQuickAddMilestone,
  onTaskToggle,
  onAddTaskToMilestone,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: group.id });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column w-80 shrink-0 bg-slate-100/70 rounded-2xl p-4 border transition-colors flex flex-col gap-3 min-h-[460px] ${
        isOver ? "border-purple-400 bg-purple-50/40 ring-2 ring-purple-400/20" : "border-slate-200/70"
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between min-h-[32px]">
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide flex items-center gap-1.5 shadow-2xs ${group.badgeBg}`}>
            {group.badgeIcon}
            <span>{group.name}</span>
          </div>
          <span className="text-xs font-semibold text-slate-500 pl-0.5">{items.length}</span>
        </div>

        {group.headerIcons && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setAddingMilestoneColumn(group.id)}
              className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100/60 rounded-md transition-colors cursor-pointer"
              title="Add milestone"
              aria-label={`Add milestone to ${group.name}`}
            >
              <Plus size={16} aria-hidden="true" />
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

        {items.length === 0 && addingMilestoneColumn !== group.id && (
          <div className="flex-1 flex items-center justify-center p-6 border-2 border-dashed border-slate-200/80 rounded-xl text-xs text-slate-400 font-medium">
            Drop milestones here
          </div>
        )}
      </div>

      {/* Inline Add Milestone Input Form */}
      {addingMilestoneColumn === group.id ? (
        <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-sm mt-1">
          {goals.length > 1 && (
            <div className="mb-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Parent Goal
              </label>
              <select
                value={selectedGoalId || goals[0]?.id || ""}
                onChange={(e) => onSelectGoal(e.target.value)}
                disabled={creatingMilestone}
                className="w-full text-xs font-medium px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            type="text"
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            disabled={creatingMilestone}
            placeholder="Enter milestone title…"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                onQuickAddMilestone(group.id);
              }
              if (e.key === "Escape") setAddingMilestoneColumn(null);
            }}
            className="w-full text-xs font-medium px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2 disabled:opacity-60"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              disabled={creatingMilestone}
              onClick={() => setAddingMilestoneColumn(null)}
              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creatingMilestone || !newMilestoneTitle.trim()}
              onClick={() => onQuickAddMilestone(group.id)}
              className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {creatingMilestone && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
              {creatingMilestone ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingMilestoneColumn(group.id)}
          className={`flex items-center gap-1.5 font-medium text-xs py-2 px-2.5 rounded-lg hover:bg-slate-200/50 transition-colors w-full text-left mt-1 cursor-pointer ${group.addTaskColor}`}
        >
          <Plus size={15} aria-hidden="true" /> Add Milestone
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
  const { confirm } = useConfirm();
  const [isExpanded, setIsExpanded] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: item.id,
  });

  // DragOverlay renders the moving card cleanly above overflow containers,
  // so we leave this slot dimmed in-place while dragging.
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.35 : 1,
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

  async function handleToggleTask(taskId: string, currentStatus: string, taskTitle: string) {
    const isDone = currentStatus === "done";
    if (currentStatus === "blocked") {
      const ok = await confirm({
        title: "Mark blocked task as done?",
        description: `“${taskTitle}” is currently marked as Blocked. Marking it done will clear its blocked status.`,
        confirmLabel: "Mark Done",
      });
      if (!ok) return;
    }
    onTaskToggle?.(taskId, isDone ? "todo" : "done", milestone?.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (!isDragging && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
          return;
        }
        listeners?.onKeyDown?.(e as never);
      }}
      aria-label={`${title} — open details`}
      className={`bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing group relative focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 ${
        isSelected ? "ring-2 ring-purple-600 border-purple-600" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
          <MilestoneIcon size={11} aria-hidden="true" />
          Milestone
        </span>

        {/* Delete Milestone Action — always visible on mobile/touch, reveal on hover/focus on desktop */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
          title="Remove or delete milestone"
          aria-label={`Delete ${title}`}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>

      {/* Milestone Title */}
      <h4 className="text-xs font-semibold text-slate-900 leading-snug">{title}</h4>

      {/* Progress Bar & Expand/Collapse Toggle Header */}
      <button
        type="button"
        className="mt-3 pt-2 border-t border-slate-100 cursor-pointer w-full text-left"
        aria-expanded={isExpanded}
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
              <ChevronDown size={14} className="text-purple-600 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight size={14} className="text-slate-400 shrink-0" aria-hidden="true" />
            )}
            <span>
              {doneCount}/{totalCount} tasks
            </span>
            <span className="text-[10px] text-slate-400 font-normal">({percent}%)</span>
          </div>
        </div>

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
      </button>

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
              className="text-purple-600 hover:text-purple-800 flex items-center gap-0.5 text-[10px] font-semibold cursor-pointer"
            >
              <Plus size={12} aria-hidden="true" /> Add
            </button>
          </div>

          {tasks.map((task) => {
            const isDone = task.status === "done";
            const nonBinaryBadge = TASK_STATUS_BADGE[task.status];
            return (
              <button
                type="button"
                key={task.id}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleTask(task.id, task.status, task.title);
                }}
                aria-pressed={isDone}
                className="group flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-50 border border-slate-100 hover:border-purple-200 cursor-pointer transition-all text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isDone ? (
                    <CheckSquare size={14} className="text-emerald-600 shrink-0" aria-hidden="true" />
                  ) : (
                    <Square size={14} className="text-slate-300 shrink-0 hover:text-purple-500" aria-hidden="true" />
                  )}
                  <SingleLineOverflow
                    text={task.title}
                    className={`text-xs text-slate-700 ${
                      isDone ? "line-through text-slate-400" : "font-medium"
                    }`}
                  />
                </div>
                {nonBinaryBadge && (
                  <span
                    className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${nonBinaryBadge.className}`}
                  >
                    {nonBinaryBadge.label}
                  </span>
                )}
              </button>
            );
          })}

          {addingTask ? (
            <form onSubmit={handleCreateTask} className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="New task title…"
                autoFocus
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="px-2 py-1 bg-purple-600 text-white text-xs font-semibold rounded-md hover:bg-purple-700 cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                aria-label="Cancel add task"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingTask(false);
                }}
                className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md cursor-pointer"
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
              className="mt-1 text-[11px] text-slate-500 hover:text-purple-600 flex items-center gap-1 py-1 px-1.5 rounded hover:bg-slate-50 w-full font-medium cursor-pointer"
            >
              <Plus size={13} aria-hidden="true" /> Add task to milestone
            </button>
          )}
        </div>
      )}
    </div>
  );
}
