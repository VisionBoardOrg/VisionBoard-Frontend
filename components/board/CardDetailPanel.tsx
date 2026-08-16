"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { X, Link2, User, CheckCircle2, Clock, AlertTriangle, Circle, ChevronDown, Check, Plus, Trash2, Calendar } from "lucide-react";
import type { BoardItemFull, GoalSimple, MilestoneWithTasks, UserSimple, TaskSimple, WebSocketEvent } from "@/types/board";
import { useBoardStore } from "@/store/board-store";

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
  planned: "Planned",
  completed: "Completed",
  delayed: "Delayed",
  draft: "Draft",
  active: "Active",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  in_review: "bg-violet-50 text-violet-700",
  blocked: "bg-red-50 text-red-700",
  done: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  planned: "bg-slate-100 text-slate-600",
  delayed: "bg-amber-50 text-amber-700",
  draft: "bg-slate-100 text-slate-600",
  active: "bg-blue-50 text-blue-700",
  cancelled: "bg-red-50 text-red-700",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 size={12} className="text-emerald-600" />,
  completed: <CheckCircle2 size={12} className="text-emerald-600" />,
  in_progress: <Clock size={12} className="text-blue-600" />,
  blocked: <AlertTriangle size={12} className="text-red-600" />,
  todo: <Circle size={12} className="text-slate-400" />,
  planned: <Circle size={12} className="text-slate-400" />,
};

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon,
}: {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
  options: { id: string; label: string; sub?: string }[];
  placeholder: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return; // only attach listener when the dropdown is actually open
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="mb-4" ref={ref}>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {icon && <span className="inline-flex items-center gap-1">{icon} {label}</span>}
        {!icon && label}
      </label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-sm text-slate-700 transition-colors"
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-52 overflow-y-auto">
          <button
            className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            None
          </button>
          {options.map((opt) => (
            <button
              key={opt.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between"
              onClick={() => { onChange(opt.id); setOpen(false); }}
            >
              <div>
                <span className="text-slate-800 font-medium">{opt.label}</span>
                {opt.sub && <span className="block text-[11px] text-slate-400">{opt.sub}</span>}
              </div>
              {opt.id === value && <Check size={13} className="text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberAvatar({ user, size = 24 }: { user: UserSimple; size?: number }) {
  // Memoize initials — prevents re-computing string splits on every render
  const initials = useMemo(
    () =>
      (user.name ?? "?")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [user.name]
  );

  if (user.image) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? "Member"}
        width={size}
        height={size}
        className="rounded-full object-cover border border-white"
        style={{ width: size, height: size }}
        // Priority false — avatars are below the fold; lazy load them
        priority={false}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white font-bold border border-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Task row inside a milestone panel (with Optimistic UI & WebSockets)
// ──────────────────────────────────────────────────
function TaskRow({
  task,
  members,
  milestoneId,
  workspaceId,
  sendEvent,
  onUpdate,
  onDelete,
}: {
  task: TaskSimple;
  members: UserSimple[];
  milestoneId?: string;
  workspaceId?: string;
  sendEvent?: (evt: Record<string, unknown>) => void;
  onUpdate: (task: TaskSimple) => void;
  onDelete: (taskId: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);

  async function deleteTask() {
    onDelete(task.id);
    if (milestoneId) {
      useBoardStore.getState().removeTaskFromMilestone(milestoneId, task.id);
    }
    if (sendEvent && workspaceId) {
      sendEvent({
        type: "TASK_DELETED",
        workspaceId,
        milestoneId,
        taskId: task.id,
      });
    }
    setDeletingTask(true);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    } catch {
      // ignore
    } finally {
      setDeletingTask(false);
      setConfirmDeleteTask(false);
    }
  }

  async function assignMember(assigneeId: string | null) {
    const prevAssigneeId = task.assigneeId;

    // 1. Optimistic UI update locally & in Zustand store
    onUpdate({ ...task, assigneeId });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { assigneeId });
    }

    // 2. Broadcast via WebSocket
    if (sendEvent && workspaceId) {
      sendEvent({
        type: "TASK_UPDATED",
        workspaceId,
        milestoneId,
        taskId: task.id,
        assigneeId,
      });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      if (!res.ok) {
        // Revert on failure
        onUpdate({ ...task, assigneeId: prevAssigneeId });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { assigneeId: prevAssigneeId });
        }
      }
    } catch {
      // Revert on error
      onUpdate({ ...task, assigneeId: prevAssigneeId });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { assigneeId: prevAssigneeId });
      }
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: string) {
    const prevStatus = task.status;

    // 1. Optimistic UI update locally & in Zustand store
    onUpdate({ ...task, status });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { status });
    }

    // 2. Broadcast via WebSocket
    if (sendEvent && workspaceId) {
      sendEvent({
        type: "TASK_UPDATED",
        workspaceId,
        milestoneId,
        taskId: task.id,
        status,
      });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        // Revert on failure
        onUpdate({ ...task, status: prevStatus });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { status: prevStatus });
        }
      }
    } catch {
      // Revert on error
      onUpdate({ ...task, status: prevStatus });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { status: prevStatus });
      }
    } finally {
      setSaving(false);
    }
  }

  async function setPriority(priority: string) {
    const prevPriority = task.priority;

    // 1. Optimistic UI update locally & in Zustand store
    onUpdate({ ...task, priority });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { priority });
    }

    // 2. Broadcast via WebSocket
    if (sendEvent && workspaceId) {
      sendEvent({
        type: "TASK_UPDATED",
        workspaceId,
        milestoneId,
        taskId: task.id,
        priority,
      });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) {
        onUpdate({ ...task, priority: prevPriority });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { priority: prevPriority });
        }
      }
    } catch {
      onUpdate({ ...task, priority: prevPriority });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { priority: prevPriority });
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateDueDate(newDateStr: string) {
    const prevDueDate = task.dueDate;
    const newDueDate = new Date(newDateStr);
    if (isNaN(newDueDate.getTime())) return;

    // 1. Optimistic UI update locally & in Zustand store
    onUpdate({ ...task, dueDate: newDueDate });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { dueDate: newDueDate });
    }

    // 2. Broadcast via WebSocket
    if (sendEvent && workspaceId) {
      sendEvent({
        type: "TASK_UPDATED",
        workspaceId,
        milestoneId,
        taskId: task.id,
        dueDate: newDueDate.toISOString(),
      });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: newDueDate.toISOString() }),
      });
      if (!res.ok) {
        onUpdate({ ...task, dueDate: prevDueDate });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { dueDate: prevDueDate });
        }
      }
    } catch {
      onUpdate({ ...task, dueDate: prevDueDate });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { dueDate: prevDueDate });
      }
    } finally {
      setSaving(false);
    }
  }

  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const priorityRef = useRef<HTMLDivElement>(null);
  const dueDateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) setPriorityOpen(false);
      if (dueDateRef.current && !dueDateRef.current.contains(e.target as Node)) setDueDateOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const assignee = members.find((m) => m.id === task.assigneeId);

  return (
    <div className={`flex items-center gap-2 py-2.5 px-2.5 sm:py-2 sm:px-2 rounded-lg hover:bg-slate-50 group transition-colors ${saving ? "opacity-75" : ""}`}>
      {/* Status dot / icon */}
      <div className="relative" ref={statusRef}>
        <button
          onClick={() => setStatusOpen(!statusOpen)}
          className="flex-shrink-0 hover:scale-110 transition-transform min-w-[24px] min-h-[24px] flex items-center justify-center"
          title="Change status"
        >
          {STATUS_ICON[task.status] ?? <Circle size={12} className="text-slate-400" />}
        </button>
        {statusOpen && (
          <div className="absolute left-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40">
            {["todo", "in_progress", "in_review", "blocked", "done"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setStatusOpen(false); }}
                className="w-full text-left px-3 py-2 sm:py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"
              >
                {STATUS_ICON[s]}
                <span className={task.status === s ? "font-semibold text-blue-600" : "text-slate-700"}>
                  {STATUS_LABELS[s]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Title */}
      <span className={`flex-1 text-[13px] truncate ${task.status === "done" ? "line-through text-slate-400" : "text-slate-700"}`}>
        {task.title}
      </span>

      {/* Due Date picker popover */}
      <div className="relative flex-shrink-0" ref={dueDateRef}>
        {(() => {
          const dateObj = task.dueDate ? new Date(task.dueDate) : new Date();
          const isValid = !isNaN(dateObj.getTime());
          const isOverdue = isValid && dateObj < new Date(new Date().setHours(0, 0, 0, 0)) && task.status !== "done";
          const isToday = isValid && dateObj.toDateString() === new Date().toDateString();
          const displayDate = isValid
            ? dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Set due date";

          return (
            <>
              <button
                type="button"
                onClick={() => setDueDateOpen(!dueDateOpen)}
                title={`Due date: ${isValid ? dateObj.toLocaleDateString() : "None"} (Click to edit)`}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-all hover:ring-2 ring-blue-200 ${
                  isOverdue
                    ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                    : isToday
                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Calendar size={10} className={isOverdue ? "text-red-500" : isToday ? "text-amber-500" : "text-slate-400"} />
                <span>{displayDate}</span>
              </button>

              {dueDateOpen && (
                <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 animate-in fade-in duration-150">
                  <div className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center justify-between">
                    <span>Task Due Date</span>
                    <button
                      type="button"
                      onClick={() => setDueDateOpen(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  </div>

                  {/* Quick Presets */}
                  <div className="grid grid-cols-2 gap-1 mb-2.5">
                    {[
                      { label: "Today", days: 0 },
                      { label: "Tomorrow", days: 1 },
                      { label: "In 3 Days", days: 3 },
                      { label: "In 1 Week", days: 7 },
                    ].map((preset) => {
                      const target = new Date();
                      target.setDate(target.getDate() + preset.days);
                      const isoDate = target.toISOString().split("T")[0];
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            updateDueDate(isoDate);
                            setDueDateOpen(false);
                          }}
                          className="text-[10px] font-medium text-left px-2 py-1 rounded bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 transition-colors"
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Date Input */}
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">Pick date</label>
                    <input
                      type="date"
                      defaultValue={isValid ? dateObj.toISOString().split("T")[0] : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateDueDate(e.target.value);
                          setDueDateOpen(false);
                        }
                      }}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Priority chip dropdown */}
      <div className="relative flex-shrink-0" ref={priorityRef}>
        <button
          onClick={() => setPriorityOpen(!priorityOpen)}
          title="Change priority (default: medium)"
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-all hover:ring-2 ring-blue-200 ${
            (task.priority ?? "medium") === "urgent" ? "bg-red-50 text-red-600 hover:bg-red-100" :
            (task.priority ?? "medium") === "high" ? "bg-amber-50 text-amber-600 hover:bg-amber-100" :
            (task.priority ?? "medium") === "medium" ? "bg-blue-50 text-blue-600 hover:bg-blue-100" :
            "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {task.priority || "medium"}
        </button>

        {priorityOpen && (
          <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-32 animate-in fade-in duration-150">
            {[
              { id: "low", label: "Low", color: "text-slate-600" },
              { id: "medium", label: "Medium", color: "text-blue-600 font-semibold" },
              { id: "high", label: "High", color: "text-amber-600 font-semibold" },
              { id: "urgent", label: "Urgent", color: "text-red-600 font-semibold" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => { setPriority(p.id); setPriorityOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between"
              >
                <span className={p.color}>{p.label}</span>
                {(task.priority || "medium") === p.id && <Check size={11} className="text-blue-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assignee avatar / picker */}
      <div className="relative flex-shrink-0" ref={assignRef}>
        <button
          onClick={() => setAssignOpen(!assignOpen)}
          title="Assign member"
          className="flex items-center justify-center hover:ring-2 ring-blue-300 rounded-full transition-all min-w-[24px] min-h-[24px]"
        >
          {assignee ? (
            <MemberAvatar user={assignee} size={20} />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors">
              <User size={10} className="text-slate-400" />
            </div>
          )}
        </button>

        {assignOpen && (
          <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44">
            <button
              className="w-full text-left px-3 py-2 sm:py-1.5 text-xs text-slate-400 hover:bg-slate-50"
              onClick={() => { assignMember(null); setAssignOpen(false); }}
            >
              Unassign
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                className="w-full text-left px-3 py-2 sm:py-1.5 hover:bg-slate-50 flex items-center gap-2"
                onClick={() => { assignMember(m.id); setAssignOpen(false); }}
              >
                <MemberAvatar user={m} size={18} />
                <span className="text-xs text-slate-700 truncate">{m.name ?? "Unknown"}</span>
                {m.id === task.assigneeId && <Check size={11} className="text-blue-600 ml-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete task action / inline prompt */}
      {confirmDeleteTask ? (
        <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-md text-[11px] font-semibold animate-in fade-in duration-150 flex-shrink-0">
          <span className="hidden sm:inline text-[10px]">Delete?</span>
          <button
            onClick={deleteTask}
            disabled={deletingTask}
            className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm transition-colors"
          >
            {deletingTask ? "…" : "Yes"}
          </button>
          <button
            onClick={() => setConfirmDeleteTask(false)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded"
            title="Cancel"
          >
            <X size={11} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDeleteTask(true)}
          disabled={deletingTask}
          title="Delete task"
          className="p-1.5 sm:p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0 touch-manipulation min-w-[28px] min-h-[28px] flex items-center justify-center"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Milestone section — extracted for clarity
// ──────────────────────────────────────────────────
function MilestoneSection({
  localItem,
  goalOptions,
  milestoneOptions,
  localTasks,
  members,
  milestoneId,
  sendEvent,
  handleMilestoneGoalLink,
  handleMilestoneLink,
  setLocalTasks,
}: {
  localItem: BoardItemFull;
  goalOptions: { id: string; label: string; sub?: string }[];
  milestoneOptions: { id: string; label: string; sub?: string }[];
  localTasks: TaskSimple[];
  members: UserSimple[];
  milestoneId: string | undefined;
  sendEvent: (evt: Record<string, unknown>) => void;
  handleMilestoneGoalLink: (goalId: string | null) => Promise<void>;
  handleMilestoneLink: (milestoneId: string | null) => Promise<void>;
  setLocalTasks: React.Dispatch<React.SetStateAction<TaskSimple[]>>;
}) {
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [taskInputOpen, setTaskInputOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultDueDate = localItem.linkedMilestone?.targetDate
    ? new Date(localItem.linkedMilestone.targetDate).toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>(defaultDueDate);

  useEffect(() => {
    if (taskInputOpen) {
      inputRef.current?.focus();
      if (localItem.linkedMilestone?.targetDate) {
        setNewTaskDueDate(new Date(localItem.linkedMilestone.targetDate).toISOString().split("T")[0]);
      }
    }
  }, [taskInputOpen, localItem.linkedMilestone?.targetDate]);

  async function submitNewTask(e?: React.FormEvent) {
    e?.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !milestoneId) return;

    const effectiveDueDate = newTaskDueDate
      ? new Date(newTaskDueDate)
      : (localItem.linkedMilestone?.targetDate ? new Date(localItem.linkedMilestone.targetDate) : new Date());

    // Optimistic update — show task immediately before the API responds
    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskSimple = {
      id: tempId,
      title,
      status: "todo",
      priority: "medium",
      storyPoints: null,
      assigneeId: null,
      dueDate: effectiveDueDate,
    };
    setLocalTasks((prev) => [...prev, optimisticTask]);
    setNewTaskTitle("");
    setTaskInputOpen(false);

    setAddingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId,
          title,
          dueDate: effectiveDueDate.toISOString(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Swap the temp task for the real one from the server
        setLocalTasks((prev) =>
          prev.map((t) => (t.id === tempId ? data.task : t))
        );
      } else {
        // Revert on failure
        setLocalTasks((prev) => prev.filter((t) => t.id !== tempId));
      }
    } catch {
      setLocalTasks((prev) => prev.filter((t) => t.id !== tempId));
    } finally {
      setAddingTask(false);
    }
  }

  const sortedTasks = useMemo(() => {
    const priorityWeight: Record<string, number> = {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return [...localTasks].sort((a, b) => {
      const aDone = a.status === "done";
      const bDone = b.status === "done";

      // 1. Done tasks always go to the bottom
      if (aDone !== bDone) {
        return aDone ? 1 : -1;
      }

      // 2. Urgent / higher priority tasks come first
      const aWeight = priorityWeight[a.priority ?? "medium"] ?? 2;
      const bWeight = priorityWeight[b.priority ?? "medium"] ?? 2;

      return bWeight - aWeight;
    });
  }, [localTasks]);

  return (
    <div>
      {/* Link to goal */}
      <div className="relative">
        <SelectField
          label="Linked Goal"
          icon={<Link2 size={11} className="text-blue-500" />}
          value={localItem.linkedMilestone?.goalId ?? localItem.linkedGoalId ?? null}
          onChange={async (goalId) => {
            await handleMilestoneGoalLink(goalId);
          }}
          options={goalOptions}
          placeholder="Link to a goal…"
        />
      </div>

      {/* Link milestone board card to a milestone entity — always visible so you can change it */}
      <div className="relative">
        <SelectField
          label="Milestone"
          icon={<Link2 size={11} className="text-violet-500" />}
          value={localItem.linkedMilestoneId ?? null}
          onChange={handleMilestoneLink}
          options={milestoneOptions}
          placeholder="Pick a milestone…"
        />
      </div>

      {/* Status */}
      {localItem.linkedMilestone && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</p>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[localItem.linkedMilestone.status] ?? "bg-slate-100 text-slate-600"}`}>
            {STATUS_LABELS[localItem.linkedMilestone.status] ?? localItem.linkedMilestone.status}
          </span>
        </div>
      )}

      {/* Tasks */}
      {localItem.linkedMilestone && (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            Tasks
            <span className="text-[10px] normal-case font-normal text-slate-400">
              {localTasks.filter((t) => t.status === "done").length}/{localTasks.length} done
            </span>
          </p>

          <div className="space-y-0.5">
            {sortedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                members={members}
                milestoneId={milestoneId}
                workspaceId={localItem.workspaceId}
                sendEvent={sendEvent}
                onUpdate={(updated) =>
                  setLocalTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                }
                onDelete={(deletedId) =>
                  setLocalTasks((prev) => prev.filter((t) => t.id !== deletedId))
                }
              />
            ))}
          </div>

          {/* Add task input */}
          {taskInputOpen ? (
            <form onSubmit={submitNewTask} className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-in fade-in duration-150">
              <input
                ref={inputRef}
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { setTaskInputOpen(false); setNewTaskTitle(""); } }}
                placeholder="Task title…"
                className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                  <Calendar size={11} className="text-slate-400" />
                  <span className="text-[10px] text-slate-400 font-medium">Due:</span>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="text-[11px] text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setTaskInputOpen(false); setNewTaskTitle(""); }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition-colors"
                    title="Cancel"
                  >
                    <X size={13} />
                  </button>
                  <button
                    type="submit"
                    disabled={!newTaskTitle.trim() || addingTask}
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {addingTask ? "…" : "Add Task"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setTaskInputOpen(true)}
              className="mt-2 w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg border border-dashed border-slate-200 hover:border-slate-300 transition-colors"
            >
              <Plus size={12} />
              Add task
            </button>
          )}
        </div>
      )}

      {!localItem.linkedMilestone && (
        <p className="text-[12px] text-slate-400 text-center py-4">Pick a milestone above to see its tasks.</p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Main CardDetailPanel
// ──────────────────────────────────────────────────

interface CardDetailPanelProps {
  item: BoardItemFull;
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  members: UserSimple[];
  /** sendEvent from the parent BoardCanvas — prevents a second WebSocket connection */
  sendEvent: (event: WebSocketEvent) => void;
  onClose: () => void;
  onItemUpdated: (updatedItem: BoardItemFull) => void;
  onItemDeleted: (itemId: string) => void;
}

export function CardDetailPanel(props: CardDetailPanelProps) {
  return <CardDetailPanelContent key={props.item.id} {...props} />;
}

function CardDetailPanelContent({
  item,
  goals,
  milestones,
  members,
  sendEvent,
  onClose,
  onItemUpdated,
  onItemDeleted,
}: CardDetailPanelProps) {
  const [localItem, setLocalItem] = useState(item);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Initial task list for milestone cards
  const initialMilestoneId = item.linkedMilestoneId ?? item.linkedMilestone?.id;
  const initialLinkedMs = milestones.find((m) => m.id === initialMilestoneId);
  const initialTasks = item.linkedMilestone?.tasks ?? initialLinkedMs?.tasks ?? [];

  const [localTasks, setLocalTasks] = useState<TaskSimple[]>(initialTasks);
  const prevTasksRef = useRef<TaskSimple[]>(initialTasks);

  // Simple alias so call-sites are unchanged
  const setLocalTasksAndSync = setLocalTasks;
  // Label for note cards
  const [noteLabel, setNoteLabel] = useState(item.label ?? "");

  // Keep local state in sync if item changes from outside (e.g. drag or WebSocket event)
  const [prevItem, setPrevItem] = useState(item);
  if (item !== prevItem) {
    setPrevItem(item);
    setLocalItem(item);
    setNoteLabel(item.label ?? "");
  }

  // Propagate task list changes to the canvas ONLY when tasks were actually modified
  useEffect(() => {
    if (!localItem.linkedMilestone) return;
    if (prevTasksRef.current === localTasks) return;
    prevTasksRef.current = localTasks;

    onItemUpdated({
      ...localItem,
      linkedMilestone: { ...localItem.linkedMilestone, tasks: localTasks },
    } as BoardItemFull);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localTasks]);

  async function patchBoardItem(patch: Record<string, unknown>) {
    setSaving(true);
    const mergedOptimistic = { ...localItem, ...patch };
    setLocalItem(mergedOptimistic as BoardItemFull);
    onItemUpdated(mergedOptimistic as BoardItemFull);

    // Broadcast card update over WebSocket immediately (optimistic)
    if (sendEvent && localItem.workspaceId) {
      sendEvent({
        type: "CARD_UPDATED",
        workspaceId: localItem.workspaceId,
        boardItem: mergedOptimistic,
      });
    }

    const res = await fetch(`/api/board-items/${localItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const data = await res.json();
      const merged = { ...localItem, ...data.boardItem };
      setLocalItem(merged);
      onItemUpdated(merged as BoardItemFull);

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    setSaving(false);
  }

  // ── Milestone link: links board item to a milestone
  async function handleMilestoneLink(milestoneId: string | null) {
    await patchBoardItem({ linkedMilestoneId: milestoneId });
    const ms = milestoneId ? milestones.find((m) => m.id === milestoneId) ?? null : null;
    setLocalItem((prev) => ({ ...prev, linkedMilestoneId: milestoneId, linkedMilestone: ms }));
    if (ms) setLocalTasks(ms.tasks);
  }

  // ── Relink milestone's goalId via the milestone entity itself
  async function handleMilestoneGoalLink(goalId: string | null) {
    if (!localItem.linkedMilestoneId) return;
    const res = await fetch(`/api/milestones/${localItem.linkedMilestoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goalId }),
    });
    if (res.ok) {
      // Update local state so the picker reflects the new goal immediately
      setLocalItem((prev) => ({
        ...prev,
        linkedGoalId: goalId,
        linkedMilestone: prev.linkedMilestone
          ? { ...prev.linkedMilestone, goalId: goalId ?? "" }
          : prev.linkedMilestone,
      }));
      // Also update the board item's linkedGoalId so connectors redraw correctly
      await patchBoardItem({ linkedGoalId: goalId });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  // ── Save note label on blur
  async function saveNoteLabel() {
    if (noteLabel === localItem.label) return;
    await patchBoardItem({ label: noteLabel });
  }

  // ── Delete the linked entity (goal or milestone) + remove board card
  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      if (onItemDeleted) {
        await onItemDeleted(localItem.id);
      }
      onClose();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const entityType = localItem.entityType;
  const headerColors: Record<string, string> = {
    goal: "from-blue-500 to-blue-600",
    milestone: "from-violet-500 to-violet-600",
    task: "from-cyan-500 to-cyan-600",
    note: "from-amber-400 to-amber-500",
  };

  // Memoize options — recomputing these on every render (including task status clicks)
  // causes unnecessary array map + filter operations across all goals/milestones.
  const goalOptions = useMemo(
    () => goals.map((g) => ({ id: g.id, label: g.title, sub: g.status })),
    [goals]
  );
  const milestoneOptions = useMemo(
    () =>
      (milestones || []).map((m) => {
        const mTasks = m.tasks ?? [];
        return {
          id: m.id,
          label: m.title,
          sub: `${mTasks.filter((t) => t.status === "done").length}/${mTasks.length} done`,
        };
      }),
    [milestones]
  );

  const milestoneId = localItem.linkedMilestoneId ?? localItem.linkedMilestone?.id;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-full sm:w-80 bg-white border-l border-slate-200 shadow-xl z-30 flex flex-col"
      style={{ animation: "slideInPanel 0.2s ease-out" }}
    >
      {/* slideInPanel keyframe is defined once in globals.css */}

      {/* Header */}
      <div className={`bg-gradient-to-r ${headerColors[entityType] ?? "from-slate-400 to-slate-500"} px-4 py-3 flex items-center justify-between`}>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            {entityType}
          </span>
          <h2 className="text-sm font-bold text-white leading-tight truncate max-w-[210px]">
            {entityType === "milestone"
              ? localItem.linkedMilestone?.title ?? localItem.label ?? "Untitled"
              : localItem.linkedGoal?.title ??
                localItem.linkedMilestone?.title ??
                localItem.label ??
                "Untitled"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[10px] text-white/70 animate-pulse">Saving…</span>
          )}
          {saved && !saving && (
            <span className="text-[10px] text-white/80 flex items-center gap-1">
              <Check size={10} /> Saved
            </span>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title={confirmDelete ? "Click again to confirm delete" : "Delete card"}
            className={`p-1 rounded-lg transition-colors text-white disabled:opacity-50 ${
              confirmDelete ? "bg-red-500 hover:bg-red-600" : "hover:bg-white/20"
            }`}
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* ── DELETE CONFIRMATION ───────── */}
        {confirmDelete && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs font-semibold text-red-700 mb-2">
              {entityType === "goal"
                ? "Delete this goal and all its milestones and tasks?"
                : entityType === "milestone"
                ? "Delete this milestone and all its tasks?"
                : `Delete this ${entityType}?`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── GOAL CARD ─────────────────── */}
        {entityType === "goal" && localItem.linkedGoal && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[localItem.linkedGoal.status] ?? "bg-slate-100 text-slate-600"}`}>
                {STATUS_LABELS[localItem.linkedGoal.status] ?? localItem.linkedGoal.status}
              </span>
              {localItem.linkedGoal.targetDate && (
                <span className="text-[11px] text-slate-500">
                  Target: {new Date(localItem.linkedGoal.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Objective</p>
              <p className="text-sm text-slate-700 leading-relaxed">{localItem.linkedGoal.objective}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Health Score</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
                    style={{ width: `${localItem.linkedGoal.healthScore}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-700">{localItem.linkedGoal.healthScore}%</span>
              </div>
            </div>
          </div>
        )}

        {/* ── MILESTONE CARD ────────────── */}
        {entityType === "milestone" && (
          <MilestoneSection
            localItem={localItem}
            goalOptions={goalOptions}
            milestoneOptions={milestoneOptions}
            localTasks={localTasks}
            members={members}
            milestoneId={milestoneId}
            sendEvent={sendEvent}
            handleMilestoneGoalLink={handleMilestoneGoalLink}
            handleMilestoneLink={handleMilestoneLink}
            setLocalTasks={setLocalTasksAndSync}
          />
        )}

        {/* ── NOTE CARD ─────────────────── */}
        {entityType === "note" && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Note Content
            </label>
            <textarea
              value={noteLabel}
              onChange={(e) => setNoteLabel(e.target.value)}
              onBlur={saveNoteLabel}
              rows={5}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
              placeholder="Write your note…"
            />
            <p className="text-[10px] text-slate-400 mt-1">Edits save automatically on blur.</p>
          </div>
        )}

        {/* ── TASK CARD (standalone) ─────── */}
        {entityType === "task" && (
          <div>
            {/* Link to a milestone */}
            <div className="relative">
              <SelectField
                label="Linked Milestone"
                icon={<Link2 size={11} className="text-violet-500" />}
                value={localItem.linkedMilestoneId}
                onChange={handleMilestoneLink}
                options={milestoneOptions}
                placeholder="Link to a milestone…"
              />
            </div>

            {/* If milestone is linked, show assign + status via task rows */}
            {localItem.linkedMilestone && localTasks.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tasks</p>
                <div className="space-y-0.5">
                  {localTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      members={members}
                      milestoneId={milestoneId}
                      workspaceId={localItem.workspaceId}
                      sendEvent={sendEvent}
                      onUpdate={(updated) =>
                        setLocalTasksAndSync((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                      }
                      onDelete={(deletedId) =>
                        setLocalTasksAndSync((prev) => prev.filter((t) => t.id !== deletedId))
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — members legend */}
      {members.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <User size={10} /> Workspace members
          </p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <MemberAvatar user={m} size={20} />
                <span className="text-[11px] text-slate-600">{m.name?.split(" ")[0] ?? "?"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
