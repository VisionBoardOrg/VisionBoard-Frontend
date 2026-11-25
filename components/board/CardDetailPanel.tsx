"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import {
  X,
  Link2,
  User,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  ChevronDown,
  Check,
  Plus,
  Trash2,
  Calendar,
} from "lucide-react";
import type {
  BoardItemFull,
  GoalSimple,
  MilestoneWithTasks,
  UserSimple,
  TaskSimple,
  TaskAssigneeSimple,
  WebSocketEvent,
} from "@/types/board";
import { useBoardStore } from "@/store/board-store";
import { useToast } from "@/context/ToastContext";
import { SingleLineOverflow } from "@/components/ui/SingleLineOverflow";

// ──────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────

/** Max number of avatars rendered inline before collapsing into a "+N" chip. */
const MAX_VISIBLE_AVATARS = 3;
const NOTE_MAX_LENGTH = 200;

function withOwnerInvariant(list: TaskAssigneeSimple[]): TaskAssigneeSimple[] {
  if (list.length === 0) return list;
  if (list.some((a) => a.role === "owner")) return list;
  return list.map((a, i) => (i === 0 ? { ...a, role: "owner" } : a));
}

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
  done: <CheckCircle2 size={12} className="text-emerald-600" aria-hidden="true" />,
  completed: <CheckCircle2 size={12} className="text-emerald-600" aria-hidden="true" />,
  in_progress: <Clock size={12} className="text-blue-600" aria-hidden="true" />,
  in_review: <Clock size={12} className="text-violet-600" aria-hidden="true" />,
  blocked: <AlertTriangle size={12} className="text-red-600" aria-hidden="true" />,
  delayed: <AlertTriangle size={12} className="text-amber-500" aria-hidden="true" />,
  todo: <Circle size={12} className="text-slate-400" aria-hidden="true" />,
  planned: <Circle size={12} className="text-slate-400" aria-hidden="true" />,
};

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon,
  allowNone = true,
}: {
  label: string;
  value: string | null;
  onChange: (val: string | null) => void;
  options: { id: string; label: string; sub?: string }[];
  placeholder: string;
  icon?: React.ReactNode;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open]);

  const selected = options.find((o) => o.id === value);

  return (
    <div className="mb-4 relative" ref={ref}>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {icon && <span className="inline-flex items-center gap-1">{icon} {label}</span>}
        {!icon && label}
      </label>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-sm text-slate-700 transition-colors cursor-pointer"
      >
        <span className={`truncate ${selected ? "text-slate-800" : "text-slate-400"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-52 overflow-y-auto"
        >
          {allowNone && (
            <button
              type="button"
              role="option"
              aria-selected={value === null}
              className="w-full text-left px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 cursor-pointer"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              None
            </button>
          )}
          {options.map((opt) => (
            <button
              type="button"
              role="option"
              aria-selected={opt.id === value}
              key={opt.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between cursor-pointer"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
            >
              <div className="min-w-0">
                <span className="text-slate-800 font-medium block truncate">{opt.label}</span>
                {opt.sub && <span className="block text-[11px] text-slate-400">{opt.sub}</span>}
              </div>
              {opt.id === value && <Check size={13} className="text-blue-600 shrink-0" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberAvatar({ user, size = 24 }: { user?: UserSimple | null; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initials = useMemo(
    () =>
      ((user?.name || "").trim() || "?")
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "?",
    [user?.name]
  );

  if (user?.image && !imgError) {
    return (
      <Image
        src={user.image}
        alt={user.name ?? "Member"}
        width={size}
        height={size}
        sizes={`${size}px`}
        onError={() => setImgError(true)}
        className="rounded-full object-cover border border-white"
        style={{ width: size, height: size }}
        priority={false}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white font-bold border border-white"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.38) }}
    >
      {initials}
    </div>
  );
}

// ──────────────────────────────────────────────────
// Task row inside a milestone panel (with Optimistic UI, rollback, toasts & WS)
// ──────────────────────────────────────────────────
function TaskRow({
  task,
  members,
  milestoneId,
  workspaceId,
  sendEvent,
  onUpdate,
  onDelete,
  onRestore,
}: {
  task: TaskSimple;
  members: UserSimple[];
  milestoneId?: string;
  workspaceId?: string;
  sendEvent?: (evt: Record<string, unknown>) => void;
  onUpdate: (task: TaskSimple) => void;
  onDelete: (taskId: string) => void;
  onRestore: (task: TaskSimple) => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);

  async function deleteTask() {
    const snapshot = task;
    onDelete(task.id);
    if (milestoneId) {
      useBoardStore.getState().removeTaskFromMilestone(milestoneId, task.id);
    }

    setDeletingTask(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // Rollback local UI and store on 403/error
        onRestore(snapshot);
        if (milestoneId) {
          useBoardStore.getState().addTaskToMilestone(milestoneId, snapshot);
        }
        toast({
          type: "error",
          title: "Could not delete task",
          description: errData.error ?? "You may not have permission to delete this task.",
        });
        return;
      }

      // Broadcast TASK_DELETED only AFTER the server confirms deletion
      if (sendEvent && workspaceId) {
        sendEvent({
          type: "TASK_DELETED",
          workspaceId,
          milestoneId,
          taskId: task.id,
        });
      }
    } catch {
      onRestore(snapshot);
      if (milestoneId) {
        useBoardStore.getState().addTaskToMilestone(milestoneId, snapshot);
      }
      toast({
        type: "error",
        title: "Could not delete task",
        description: "Network error while deleting task. Please try again.",
      });
    } finally {
      setDeletingTask(false);
      setConfirmDeleteTask(false);
    }
  }

  const taskAssignees = task.assignees ?? [];

  async function updateAssignees(next: TaskAssigneeSimple[]) {
    const prevAssignees = task.assignees ?? [];
    const normalized = withOwnerInvariant(next);

    onUpdate({ ...task, assignees: normalized });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { assignees: normalized });
    }

    if (sendEvent && workspaceId) {
      sendEvent({
        type: "TASK_UPDATED",
        workspaceId,
        milestoneId,
        taskId: task.id,
        assignees: normalized,
      });
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignees: normalized.map((a) => ({ userId: a.userId, role: a.role })),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        onUpdate({ ...task, assignees: prevAssignees });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { assignees: prevAssignees });
        }
        if (sendEvent && workspaceId) {
          sendEvent({
            type: "TASK_UPDATED",
            workspaceId,
            milestoneId,
            taskId: task.id,
            assignees: prevAssignees,
          });
        }
        toast({
          type: "error",
          title: "Could not update assignees",
          description: errData.error ?? "Change reverted. Please try again.",
        });
      }
    } catch {
      onUpdate({ ...task, assignees: prevAssignees });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { assignees: prevAssignees });
      }
      if (sendEvent && workspaceId) {
        sendEvent({
          type: "TASK_UPDATED",
          workspaceId,
          milestoneId,
          taskId: task.id,
          assignees: prevAssignees,
        });
      }
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not save assignee change. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function toggleAssignee(memberId: string) {
    const existing = taskAssignees.find((a) => a.userId === memberId);
    if (existing) {
      updateAssignees(taskAssignees.filter((a) => a.userId !== memberId));
      return;
    }
    const role: TaskAssigneeSimple["role"] = taskAssignees.length === 0 ? "owner" : "contributor";
    const member = members.find((m) => m.id === memberId) ?? null;
    updateAssignees([...taskAssignees, { userId: memberId, role, user: member }]);
  }

  function cycleRole(memberId: string) {
    updateAssignees(
      taskAssignees.map((a) =>
        a.userId === memberId
          ? { ...a, role: a.role === "owner" ? "contributor" : "owner" }
          : a
      )
    );
  }

  async function setStatus(status: string) {
    const prevStatus = task.status;

    onUpdate({ ...task, status });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { status });
    }

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
        const errData = await res.json().catch(() => ({}));
        onUpdate({ ...task, status: prevStatus });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { status: prevStatus });
        }
        if (sendEvent && workspaceId) {
          sendEvent({
            type: "TASK_UPDATED",
            workspaceId,
            milestoneId,
            taskId: task.id,
            status: prevStatus,
          });
        }
        toast({
          type: "error",
          title: "Could not update task status",
          description: errData.error ?? "Change reverted. Please try again.",
        });
      }
    } catch {
      onUpdate({ ...task, status: prevStatus });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { status: prevStatus });
      }
      if (sendEvent && workspaceId) {
        sendEvent({
          type: "TASK_UPDATED",
          workspaceId,
          milestoneId,
          taskId: task.id,
          status: prevStatus,
        });
      }
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not save task status. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function setPriority(priority: string) {
    const prevPriority = task.priority;

    onUpdate({ ...task, priority });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { priority });
    }

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
        const errData = await res.json().catch(() => ({}));
        onUpdate({ ...task, priority: prevPriority });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { priority: prevPriority });
        }
        if (sendEvent && workspaceId) {
          sendEvent({
            type: "TASK_UPDATED",
            workspaceId,
            milestoneId,
            taskId: task.id,
            priority: prevPriority,
          });
        }
        toast({
          type: "error",
          title: "Could not update priority",
          description: errData.error ?? "Change reverted. Please try again.",
        });
      }
    } catch {
      onUpdate({ ...task, priority: prevPriority });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { priority: prevPriority });
      }
      if (sendEvent && workspaceId) {
        sendEvent({
          type: "TASK_UPDATED",
          workspaceId,
          milestoneId,
          taskId: task.id,
          priority: prevPriority,
        });
      }
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not save task priority. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateDueDate(newDateStr: string) {
    const prevDueDate = task.dueDate;
    const newDueDate = new Date(newDateStr);
    if (isNaN(newDueDate.getTime())) return;

    onUpdate({ ...task, dueDate: newDueDate });
    if (milestoneId) {
      useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { dueDate: newDueDate });
    }

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
        const errData = await res.json().catch(() => ({}));
        onUpdate({ ...task, dueDate: prevDueDate });
        if (milestoneId) {
          useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { dueDate: prevDueDate });
        }
        if (sendEvent && workspaceId) {
          sendEvent({
            type: "TASK_UPDATED",
            workspaceId,
            milestoneId,
            taskId: task.id,
            dueDate: prevDueDate ? new Date(prevDueDate).toISOString() : null,
          });
        }
        toast({
          type: "error",
          title: "Could not update due date",
          description: errData.error ?? "Change reverted. Please try again.",
        });
      }
    } catch {
      onUpdate({ ...task, dueDate: prevDueDate });
      if (milestoneId) {
        useBoardStore.getState().updateTaskInMilestone(milestoneId, task.id, { dueDate: prevDueDate });
      }
      if (sendEvent && workspaceId) {
        sendEvent({
          type: "TASK_UPDATED",
          workspaceId,
          milestoneId,
          taskId: task.id,
          dueDate: prevDueDate ? new Date(prevDueDate).toISOString() : null,
        });
      }
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not save due date. Please try again.",
      });
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

  const anyMenuOpen = assignOpen || statusOpen || priorityOpen || dueDateOpen;

  useEffect(() => {
    if (!anyMenuOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) setPriorityOpen(false);
      if (dueDateRef.current && !dueDateRef.current.contains(e.target as Node)) setDueDateOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setAssignOpen(false);
        setStatusOpen(false);
        setPriorityOpen(false);
        setDueDateOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anyMenuOpen]);

  const visibleAssignees = taskAssignees.slice(0, MAX_VISIBLE_AVATARS);
  const hiddenAssigneeCount = taskAssignees.length - visibleAssignees.length;

  return (
    <div
      className={`flex items-center gap-2 py-2.5 px-2.5 sm:py-2 sm:px-2 rounded-lg hover:bg-slate-50 group transition-colors ${
        saving ? "opacity-75" : ""
      }`}
    >
      {/* Status dot / icon */}
      <div className="relative" ref={statusRef}>
        <button
          type="button"
          onClick={() => setStatusOpen(!statusOpen)}
          aria-expanded={statusOpen}
          aria-haspopup="menu"
          aria-label={`Task status: ${STATUS_LABELS[task.status] ?? task.status}. Click to change.`}
          className="flex-shrink-0 hover:scale-110 transition-transform min-w-[24px] min-h-[24px] flex items-center justify-center cursor-pointer"
          title="Change status"
        >
          {STATUS_ICON[task.status] ?? <Circle size={12} className="text-slate-400" aria-hidden="true" />}
        </button>
        {statusOpen && (
          <div
            role="menu"
            aria-label="Change task status"
            className="absolute left-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40"
          >
            {["todo", "in_progress", "in_review", "blocked", "done"].map((s) => (
              <button
                type="button"
                role="menuitem"
                key={s}
                onClick={() => {
                  setStatus(s);
                  setStatusOpen(false);
                }}
                className="w-full text-left px-3 py-2 sm:py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
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
      <SingleLineOverflow
        text={task.title}
        focusableWhenTruncated
        className={`flex-1 text-[13px] rounded-xs ${
          task.status === "done" ? "line-through text-slate-400" : "text-slate-700"
        }`}
      />

      {/* Due Date picker popover */}
      <div className="relative flex-shrink-0" ref={dueDateRef}>
        {(() => {
          const dateObj = task.dueDate ? new Date(task.dueDate) : null;
          const isValid = dateObj ? !isNaN(dateObj.getTime()) : false;
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const isOverdue = isValid && dateObj! < todayStart && task.status !== "done";
          const isToday = isValid && dateObj!.toDateString() === todayStart.toDateString();
          const displayDate = isValid
            ? dateObj!.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Set due date";

          return (
            <>
              <button
                type="button"
                aria-expanded={dueDateOpen}
                aria-haspopup="dialog"
                aria-label={`Due date: ${displayDate}. Click to edit.`}
                onClick={() => setDueDateOpen(!dueDateOpen)}
                title={`Due date: ${isValid && dateObj ? dateObj.toLocaleDateString() : "None"} (Click to edit)`}
                className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-all hover:ring-2 ring-blue-200 cursor-pointer ${
                  isOverdue
                    ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                    : isToday
                    ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <Calendar
                  size={10}
                  aria-hidden="true"
                  className={isOverdue ? "text-red-500" : isToday ? "text-amber-500" : "text-slate-400"}
                />
                <span>{displayDate}</span>
              </button>

              {dueDateOpen && (
                <div
                  role="dialog"
                  aria-label="Edit task due date"
                  className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 w-56 animate-in fade-in duration-150"
                >
                  <div className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center justify-between">
                    <span>Task Due Date</span>
                    <button
                      type="button"
                      aria-label="Close due date picker"
                      onClick={() => setDueDateOpen(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X size={12} aria-hidden="true" />
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
                          className="text-[10px] font-medium text-left px-2 py-1 rounded bg-slate-50 hover:bg-blue-50 hover:text-blue-600 text-slate-700 transition-colors cursor-pointer"
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
                      defaultValue={isValid && dateObj ? dateObj.toISOString().split("T")[0] : ""}
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
          type="button"
          aria-expanded={priorityOpen}
          aria-haspopup="menu"
          aria-label={`Priority: ${task.priority || "medium"}. Click to change.`}
          onClick={() => setPriorityOpen(!priorityOpen)}
          title="Change priority"
          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-all hover:ring-2 ring-blue-200 ${
            (task.priority ?? "medium") === "urgent"
              ? "bg-red-50 text-red-600 hover:bg-red-100"
              : (task.priority ?? "medium") === "high"
              ? "bg-amber-50 text-amber-600 hover:bg-amber-100"
              : (task.priority ?? "medium") === "medium"
              ? "bg-blue-50 text-blue-600 hover:bg-blue-100"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          {task.priority || "medium"}
        </button>

        {priorityOpen && (
          <div
            role="menu"
            aria-label="Change task priority"
            className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-32 animate-in fade-in duration-150"
          >
            {[
              { id: "low", label: "Low", color: "text-slate-600" },
              { id: "medium", label: "Medium", color: "text-blue-600 font-semibold" },
              { id: "high", label: "High", color: "text-amber-600 font-semibold" },
              { id: "urgent", label: "Urgent", color: "text-red-600 font-semibold" },
            ].map((p) => (
              <button
                type="button"
                role="menuitem"
                key={p.id}
                onClick={() => {
                  setPriority(p.id);
                  setPriorityOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer"
              >
                <span className={p.color}>{p.label}</span>
                {(task.priority || "medium") === p.id && (
                  <Check size={11} className="text-blue-600" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Assignees avatar stack / picker */}
      <div className="relative flex-shrink-0" ref={assignRef}>
        <button
          type="button"
          aria-expanded={assignOpen}
          aria-haspopup="menu"
          aria-label="Assign people to task"
          onClick={() => setAssignOpen(!assignOpen)}
          title="Assign people"
          className="flex items-center justify-center hover:ring-2 ring-blue-300 rounded-full transition-all min-w-[24px] min-h-[24px] cursor-pointer"
        >
          {taskAssignees.length === 0 ? (
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center hover:border-slate-400 transition-colors">
              <User size={10} className="text-slate-400" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex items-center -space-x-1.5">
              {visibleAssignees.map((a) => {
                const member =
                  members.find((m) => m.id === a.userId) ??
                  a.user ?? { id: a.userId, name: null, image: null };
                return (
                  <div key={a.userId} className="relative">
                    <MemberAvatar user={member} size={20} />
                    {a.role === "owner" && (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-white"
                        title="Owner"
                      />
                    )}
                  </div>
                );
              })}
              {hiddenAssigneeCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[9px] font-bold flex items-center justify-center border border-white">
                  +{hiddenAssigneeCount}
                </span>
              )}
            </div>
          )}
        </button>

        {assignOpen && (
          <div
            role="menu"
            aria-label="Task assignees"
            className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-56 max-h-72 overflow-y-auto"
          >
            {members.map((m) => {
              const assignment = taskAssignees.find((a) => a.userId === m.id);
              return (
                <div key={m.id} className="flex items-center gap-2 px-3 py-2 sm:py-1.5 hover:bg-slate-50">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={Boolean(assignment)}
                    onClick={() => toggleAssignee(m.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <MemberAvatar user={m} size={18} />
                    <span className="text-xs text-slate-700 truncate">{m.name ?? "Unknown"}</span>
                  </button>
                  {assignment && (
                    <button
                      type="button"
                      onClick={() => cycleRole(m.id)}
                      title="Toggle owner / contributor"
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border transition-colors flex-shrink-0 cursor-pointer ${
                        assignment.role === "owner"
                          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {assignment.role === "owner" ? "Owner" : "Contributor"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete task action / inline prompt */}
      {confirmDeleteTask ? (
        <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded-md text-[11px] font-semibold animate-in fade-in duration-150 flex-shrink-0">
          <span className="hidden sm:inline text-[10px]">Delete?</span>
          <button
            type="button"
            onClick={deleteTask}
            disabled={deletingTask}
            className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm transition-colors cursor-pointer"
          >
            {deletingTask ? "…" : "Yes"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteTask(false)}
            className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
            title="Cancel"
            aria-label="Cancel delete task"
          >
            <X size={11} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmDeleteTask(true)}
          disabled={deletingTask}
          title="Delete task"
          aria-label={`Delete task ${task.title}`}
          className="p-1.5 sm:p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0 touch-manipulation min-w-[28px] min-h-[28px] flex items-center justify-center cursor-pointer"
        >
          <Trash2 size={13} aria-hidden="true" />
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
  handleMilestoneStatusChange,
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
  handleMilestoneStatusChange: (newStatus: string) => Promise<void>;
  setLocalTasks: React.Dispatch<React.SetStateAction<TaskSimple[]>>;
}) {
  const { toast } = useToast();
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [taskInputOpen, setTaskInputOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultDueDate = (() => {
    if (localItem.linkedMilestone?.targetDate) {
      const d = new Date(localItem.linkedMilestone.targetDate);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    }
    return new Date().toISOString().split("T")[0];
  })();
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>(defaultDueDate);

  useEffect(() => {
    if (taskInputOpen) {
      inputRef.current?.focus();
      if (localItem.linkedMilestone?.targetDate) {
        const d = new Date(localItem.linkedMilestone.targetDate);
        if (!isNaN(d.getTime())) {
          setNewTaskDueDate(d.toISOString().split("T")[0]);
        }
      }
    }
  }, [taskInputOpen, localItem.linkedMilestone?.targetDate]);

  async function submitNewTask(e?: React.FormEvent) {
    e?.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !milestoneId) return;

    const parsedNewDate = newTaskDueDate ? new Date(newTaskDueDate) : null;
    const parsedTargetDate = localItem.linkedMilestone?.targetDate
      ? new Date(localItem.linkedMilestone.targetDate)
      : null;
    const effectiveDueDate =
      parsedNewDate && !isNaN(parsedNewDate.getTime())
        ? parsedNewDate
        : parsedTargetDate && !isNaN(parsedTargetDate.getTime())
        ? parsedTargetDate
        : new Date();

    const tempId = `temp-${Date.now()}`;
    const optimisticTask: TaskSimple = {
      id: tempId,
      title,
      status: "todo",
      priority: "medium",
      storyPoints: null,
      assignees: [],
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
        setLocalTasks((prev) => prev.map((t) => (t.id === tempId ? data.task : t)));
        useBoardStore.getState().addTaskToMilestone(milestoneId, data.task);
        sendEvent({
          type: "TASK_CREATED",
          workspaceId: localItem.workspaceId,
          milestoneId,
          task: data.task,
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setLocalTasks((prev) => prev.filter((t) => t.id !== tempId));
        toast({
          type: "error",
          title: "Could not add task",
          description: errData.error ?? "Failed to create task. Please try again.",
        });
      }
    } catch {
      setLocalTasks((prev) => prev.filter((t) => t.id !== tempId));
      toast({
        type: "error",
        title: "Connection error",
        description: "Failed to add task. Please check your network.",
      });
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

    return localTasks.toSorted((a, b) => {
      const aDone = a.status === "done";
      const bDone = b.status === "done";
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aWeight = priorityWeight[a.priority ?? "medium"] ?? 2;
      const bWeight = priorityWeight[b.priority ?? "medium"] ?? 2;
      return bWeight - aWeight;
    });
  }, [localTasks]);

  const currentMilestoneStatus = localItem.linkedMilestone?.status ?? "planned";

  return (
    <div>
      {/* Link to goal — Prisma Milestone.goalId is required, so no "None" option */}
      <div className="relative">
        <SelectField
          label="Linked Goal"
          icon={<Link2 size={11} className="text-blue-500" aria-hidden="true" />}
          value={localItem.linkedMilestone?.goalId ?? localItem.linkedGoalId ?? null}
          onChange={async (goalId) => {
            if (!goalId) return;
            await handleMilestoneGoalLink(goalId);
          }}
          options={goalOptions}
          placeholder="Link to a goal…"
          allowNone={false}
        />
      </div>

      {/* Link milestone board card to a milestone entity */}
      <div className="relative">
        <SelectField
          label="Milestone"
          icon={<Link2 size={11} className="text-violet-500" aria-hidden="true" />}
          value={localItem.linkedMilestoneId ?? null}
          onChange={handleMilestoneLink}
          options={milestoneOptions}
          placeholder="Pick a milestone…"
        />
      </div>

      {/* Editable Milestone Status */}
      {localItem.linkedMilestone && (
        <div className="mb-4">
          <label
            htmlFor="milestone-status-select"
            className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
          >
            Status
          </label>
          <select
            id="milestone-status-select"
            aria-label="Milestone status"
            value={
              ["planned", "in_progress", "completed", "delayed"].includes(currentMilestoneStatus)
                ? currentMilestoneStatus
                : "planned"
            }
            onChange={(e) => handleMilestoneStatusChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer"
          >
            <option value="planned">Planned</option>
            <option value="in_progress">In Progress</option>
            <option value="delayed">Delayed</option>
            <option value="completed">Completed</option>
          </select>
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
                onRestore={(restored) =>
                  setLocalTasks((prev) =>
                    prev.some((t) => t.id === restored.id) ? prev : [...prev, restored]
                  )
                }
              />
            ))}
          </div>

          {/* Add task input */}
          {taskInputOpen ? (
            <form
              onSubmit={submitNewTask}
              className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-2 animate-in fade-in duration-150"
            >
              <input
                ref={inputRef}
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setTaskInputOpen(false);
                    setNewTaskTitle("");
                  }
                }}
                placeholder="Task title…"
                className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white border border-slate-200 rounded-md px-2 py-0.5">
                  <Calendar size={11} className="text-slate-400" aria-hidden="true" />
                  <span className="text-[10px] text-slate-400 font-medium">Due:</span>
                  <input
                    type="date"
                    aria-label="New task due date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="text-[11px] text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTaskInputOpen(false);
                      setNewTaskTitle("");
                    }}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition-colors cursor-pointer"
                    title="Cancel"
                    aria-label="Cancel add task"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="submit"
                    disabled={!newTaskTitle.trim() || addingTask}
                    className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
                  >
                    {addingTask ? "…" : "Add Task"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setTaskInputOpen(true)}
              className="mt-2 w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg border border-dashed border-slate-200 hover:border-slate-300 transition-colors cursor-pointer"
            >
              <Plus size={12} aria-hidden="true" />
              Add task
            </button>
          )}
        </div>
      )}

      {!localItem.linkedMilestone && (
        <p className="text-[12px] text-slate-400 text-center py-4">
          Pick a milestone above to see its tasks.
        </p>
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
  onItemDeleted: (itemId: string, options?: { mode?: "remove-card" | "delete-entity" }) => void | Promise<void>;
  onItemStatusChange?: (itemId: string, newStatus: string) => void | Promise<void>;
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
  onItemStatusChange,
}: CardDetailPanelProps) {
  const { toast } = useToast();
  const [localItem, setLocalItem] = useState(item);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initialMilestoneId = item.linkedMilestoneId ?? item.linkedMilestone?.id;
  const initialLinkedMs = milestones.find((m) => m.id === initialMilestoneId);
  const initialTasks = item.linkedMilestone?.tasks ?? initialLinkedMs?.tasks ?? [];

  const [localTasks, setLocalTasks] = useState<TaskSimple[]>(initialTasks);
  const prevTasksRef = useRef<TaskSimple[]>(initialTasks);
  const [noteLabel, setNoteLabel] = useState(item.label ?? "");
  const noteLabelRef = useRef(noteLabel);
  const savedLabelRef = useRef(item.label ?? "");

  useEffect(() => {
    noteLabelRef.current = noteLabel;
  }, [noteLabel]);

  // Keep local state in sync if item changes from outside (e.g. drag or WebSocket event)
  const [prevItem, setPrevItem] = useState(item);
  if (item !== prevItem) {
    setPrevItem(item);
    setLocalItem(item);
    setNoteLabel(item.label ?? "");
    if (item.linkedMilestone?.tasks && item.linkedMilestone.tasks !== prevItem.linkedMilestone?.tasks) {
      setLocalTasks(item.linkedMilestone.tasks);
    }
  }

  // Sync ref mirrors in effects (never mutate refs during render)
  useEffect(() => {
    savedLabelRef.current = item.label ?? "";
    if (item.linkedMilestone?.tasks) {
      prevTasksRef.current = item.linkedMilestone.tasks;
    }
  }, [item]);

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

  const patchBoardItem = useCallback(
    async (patch: Record<string, unknown>) => {
      const previous = localItem;
      setSaving(true);
      const mergedOptimistic = { ...localItem, ...patch } as BoardItemFull;
      setLocalItem(mergedOptimistic);
      onItemUpdated(mergedOptimistic);

      if (sendEvent && localItem.workspaceId) {
        sendEvent({
          type: "CARD_UPDATED",
          workspaceId: localItem.workspaceId,
          boardItem: mergedOptimistic,
        });
      }

      try {
        const res = await fetch(`/api/board-items/${localItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setLocalItem(previous);
          onItemUpdated(previous);
          if (sendEvent && localItem.workspaceId) {
            sendEvent({
              type: "CARD_UPDATED",
              workspaceId: localItem.workspaceId,
              boardItem: previous,
            });
          }
          toast({
            type: "error",
            title: "Could not save changes",
            description: errData.error ?? "Your edit was reverted. Please try again.",
          });
          return false;
        }

        const data = await res.json();
        const merged = { ...localItem, ...data.boardItem } as BoardItemFull;
        setLocalItem(merged);
        onItemUpdated(merged);
        if (typeof patch.label === "string") {
          savedLabelRef.current = patch.label;
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        return true;
      } catch {
        setLocalItem(previous);
        onItemUpdated(previous);
        if (sendEvent && localItem.workspaceId) {
          sendEvent({
            type: "CARD_UPDATED",
            workspaceId: localItem.workspaceId,
            boardItem: previous,
          });
        }
        toast({
          type: "error",
          title: "Connection error",
          description: "Could not save changes. Check your connection and try again.",
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [localItem, onItemUpdated, sendEvent, toast]
  );

  // Flush dirty note before closing or unmounting
  const saveNoteLabel = useCallback(async () => {
    if (localItem.entityType !== "note") return;
    const trimmed = noteLabelRef.current.slice(0, NOTE_MAX_LENGTH);
    if (trimmed === savedLabelRef.current) return;
    await patchBoardItem({ label: trimmed });
  }, [localItem.entityType, patchBoardItem]);

  useEffect(() => {
    const itemId = localItem.id;
    const isNote = localItem.entityType === "note";
    return () => {
      if (isNote && noteLabelRef.current !== savedLabelRef.current) {
        const nextLabel = noteLabelRef.current.slice(0, NOTE_MAX_LENGTH);
        fetch(`/api/board-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: nextLabel }),
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [localItem.id, localItem.entityType]);

  const handleClose = useCallback(() => {
    if (localItem.entityType === "note" && noteLabelRef.current !== savedLabelRef.current) {
      void saveNoteLabel();
    }
    onClose();
  }, [localItem.entityType, onClose, saveNoteLabel]);

  // Escape key closes the detail panel (popovers stopPropagation when open)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  async function handleMilestoneLink(milestoneId: string | null) {
    const ok = await patchBoardItem({ linkedMilestoneId: milestoneId });
    if (!ok) return;
    const ms = milestoneId ? milestones.find((m) => m.id === milestoneId) ?? null : null;
    setLocalItem((prev) => ({ ...prev, linkedMilestoneId: milestoneId, linkedMilestone: ms }));
    if (ms) {
      prevTasksRef.current = ms.tasks;
      setLocalTasks(ms.tasks);
    }
  }

  async function handleMilestoneGoalLink(goalId: string | null) {
    if (!localItem.linkedMilestoneId || !goalId) return;
    const previous = localItem;
    setSaving(true);
    try {
      const res = await fetch(`/api/milestones/${localItem.linkedMilestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({
          type: "error",
          title: "Could not link goal",
          description: errData.error ?? "Failed to update milestone goal.",
        });
        return;
      }

      setLocalItem((prev) => ({
        ...prev,
        linkedGoalId: goalId,
        linkedMilestone: prev.linkedMilestone
          ? { ...prev.linkedMilestone, goalId }
          : prev.linkedMilestone,
      }));
      const ok = await patchBoardItem({ linkedGoalId: goalId });
      if (!ok) {
        setLocalItem(previous);
      }
    } catch {
      toast({
        type: "error",
        title: "Connection error",
        description: "Failed to update milestone goal. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleMilestoneStatusChange(newStatus: string) {
    if (!localItem.linkedMilestoneId || !localItem.linkedMilestone) return;
    if (onItemStatusChange) {
      await onItemStatusChange(localItem.id, newStatus);
      return;
    }
    const prevStatus = localItem.linkedMilestone.status;
    setSaving(true);
    const updatedItem: BoardItemFull = {
      ...localItem,
      linkedMilestone: { ...localItem.linkedMilestone, status: newStatus },
    };
    setLocalItem(updatedItem);
    onItemUpdated(updatedItem);
    try {
      const res = await fetch(`/api/milestones/${localItem.linkedMilestoneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const reverted: BoardItemFull = {
          ...localItem,
          linkedMilestone: { ...localItem.linkedMilestone, status: prevStatus },
        };
        setLocalItem(reverted);
        onItemUpdated(reverted);
        toast({
          type: "error",
          title: "Could not update milestone status",
          description: errData.error ?? "Status change reverted.",
        });
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      const reverted: BoardItemFull = {
        ...localItem,
        linkedMilestone: { ...localItem.linkedMilestone, status: prevStatus },
      };
      setLocalItem(reverted);
      onItemUpdated(reverted);
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not save milestone status.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function executeDelete(mode: "remove-card" | "delete-entity") {
    setDeleting(true);
    try {
      await onItemDeleted(localItem.id, { mode });
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

  const goalOptions = useMemo(
    () => (goals || []).map((g) => ({ id: g.id, label: g.title, sub: g.status })),
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
  const linkedGoalMilestoneCount =
    entityType === "goal" && localItem.linkedGoalId
      ? milestones.filter((m) => m.goalId === localItem.linkedGoalId).length
      : 0;

  return (
    <>
      {/* Mobile backdrop — tap outside the panel to close */}
      <div
        className="absolute inset-0 z-20 bg-ink/30 sm:hidden"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[440px] bg-white border-l border-slate-200 shadow-xl z-30 flex flex-col"
        style={{ animation: "slideInPanel 0.2s ease-out" }}
        role="dialog"
        aria-label={`${entityType} details`}
      >
        {/* Header */}
        <div
          className={`bg-gradient-to-r ${headerColors[entityType] ?? "from-slate-400 to-slate-500"} px-4 py-3 flex items-center justify-between gap-3`}
        >
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
              {entityType}
            </span>
            <h2 className="text-sm font-bold text-white leading-tight truncate">
              {entityType === "milestone"
                ? localItem.linkedMilestone?.title ?? localItem.label ?? "Untitled"
                : localItem.linkedGoal?.title ??
                  localItem.linkedMilestone?.title ??
                  localItem.label ??
                  "Untitled"}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && <span className="text-[10px] text-white/80 animate-pulse">Saving…</span>}
            {saved && !saving && (
              <span className="text-[10px] text-white/90 flex items-center gap-1">
                <Check size={10} aria-hidden="true" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete((prev) => !prev)}
              disabled={deleting}
              aria-label="Delete or remove card"
              title="Delete or remove card"
              className={`p-1 rounded-lg transition-colors text-white disabled:opacity-50 cursor-pointer ${
                confirmDelete ? "bg-red-500 hover:bg-red-600" : "hover:bg-white/20"
              }`}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close panel"
              title="Close panel (Esc)"
              className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white cursor-pointer"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* ── DELETE CONFIRMATION ───────── */}
          {confirmDelete && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2.5">
              <p className="text-xs font-semibold text-red-800">
                {entityType === "goal"
                  ? `Remove card or permanently delete this goal${
                      linkedGoalMilestoneCount > 0
                        ? ` and its ${linkedGoalMilestoneCount} milestone${linkedGoalMilestoneCount === 1 ? "" : "s"}`
                        : ""
                    }?`
                  : entityType === "milestone"
                  ? `Remove card or permanently delete this milestone${
                      localTasks.length > 0
                        ? ` and its ${localTasks.length} task${localTasks.length === 1 ? "" : "s"}`
                        : ""
                    }?`
                  : `Delete this ${entityType} card from the board?`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {(entityType === "goal" || entityType === "milestone") && (
                  <button
                    type="button"
                    onClick={() => executeDelete("remove-card")}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Remove from board only
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    executeDelete(
                      entityType === "goal" || entityType === "milestone"
                        ? "delete-entity"
                        : "remove-card"
                    )
                  }
                  disabled={deleting}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {deleting
                    ? "Deleting…"
                    : entityType === "goal" || entityType === "milestone"
                    ? `Delete ${entityType} permanently`
                    : "Delete card"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
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
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    STATUS_COLORS[localItem.linkedGoal.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {STATUS_LABELS[localItem.linkedGoal.status] ?? localItem.linkedGoal.status}
                </span>
                {localItem.linkedGoal.targetDate &&
                  !isNaN(new Date(localItem.linkedGoal.targetDate).getTime()) && (
                    <span className="text-[11px] text-slate-500">
                      Target:{" "}
                      {new Date(localItem.linkedGoal.targetDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Objective
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {localItem.linkedGoal.objective}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Health Score
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-400 to-emerald-400"
                      style={{ width: `${localItem.linkedGoal.healthScore}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-700">
                    {localItem.linkedGoal.healthScore}%
                  </span>
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
              handleMilestoneStatusChange={handleMilestoneStatusChange}
              setLocalTasks={setLocalTasks}
            />
          )}

          {/* ── NOTE CARD ─────────────────── */}
          {entityType === "note" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="note-content-textarea"
                  className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
                >
                  Note Content
                </label>
                <span
                  className={`text-[10px] font-mono ${
                    noteLabel.length >= NOTE_MAX_LENGTH ? "text-danger font-semibold" : "text-slate-400"
                  }`}
                >
                  {noteLabel.length}/{NOTE_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id="note-content-textarea"
                value={noteLabel}
                onChange={(e) => setNoteLabel(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                onBlur={saveNoteLabel}
                maxLength={NOTE_MAX_LENGTH}
                rows={5}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
                placeholder="Write your note…"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Saves automatically when you leave the field or close the panel.
              </p>
            </div>
          )}

          {/* ── TASK CARD (standalone) ─────── */}
          {entityType === "task" && (
            <div>
              <div className="relative">
                <SelectField
                  label="Linked Milestone"
                  icon={<Link2 size={11} className="text-violet-500" aria-hidden="true" />}
                  value={localItem.linkedMilestoneId}
                  onChange={handleMilestoneLink}
                  options={milestoneOptions}
                  placeholder="Link to a milestone…"
                />
              </div>

              {localItem.linkedMilestone && localTasks.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Tasks
                  </p>
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
                          setLocalTasks((prev) =>
                            prev.map((t) => (t.id === updated.id ? updated : t))
                          )
                        }
                        onDelete={(deletedId) =>
                          setLocalTasks((prev) => prev.filter((t) => t.id !== deletedId))
                        }
                        onRestore={(restored) =>
                          setLocalTasks((prev) =>
                            prev.some((t) => t.id === restored.id) ? prev : [...prev, restored]
                          )
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
              <User size={10} aria-hidden="true" /> Workspace members
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
    </>
  );
}
