"use client";

import { useState, useEffect, useRef } from "react";
import { X, Link2, User, CheckCircle2, Clock, AlertTriangle, Circle, ChevronDown, Check } from "lucide-react";
import type { BoardItemFull, GoalSimple, MilestoneWithTasks, UserSimple, TaskSimple } from "@/types/board";
import { useBoardStore } from "@/store/board-store";
import { useWebSocket } from "@/hooks/useWebSocket";

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
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={user.name ?? "Member"}
        width={size}
        height={size}
        className="rounded-full object-cover border border-white"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = (user.name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
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
}: {
  task: TaskSimple;
  members: UserSimple[];
  milestoneId?: string;
  workspaceId?: string;
  sendEvent?: (evt: Record<string, unknown>) => void;
  onUpdate: (task: TaskSimple) => void;
}) {
  const [saving, setSaving] = useState(false);

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

  const [assignOpen, setAssignOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const assignRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const assignee = members.find((m) => m.id === task.assigneeId);

  return (
    <div className={`flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-slate-50 group transition-colors ${saving ? "opacity-75" : ""}`}>
      {/* Status dot / icon */}
      <div className="relative" ref={statusRef}>
        <button
          onClick={() => setStatusOpen(!statusOpen)}
          className="flex-shrink-0 hover:scale-110 transition-transform"
          title="Change status"
        >
          {STATUS_ICON[task.status] ?? <Circle size={12} className="text-slate-400" />}
        </button>
        {statusOpen && (
          <div className="absolute left-0 top-5 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-40">
            {["todo", "in_progress", "in_review", "blocked", "done"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setStatusOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2"
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

      {/* Priority chip */}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
        task.priority === "urgent" ? "bg-red-50 text-red-600" :
        task.priority === "high" ? "bg-amber-50 text-amber-600" :
        task.priority === "medium" ? "bg-blue-50 text-blue-600" :
        "bg-slate-100 text-slate-500"
      }`}>
        {task.priority}
      </span>

      {/* Assignee avatar / picker */}
      <div className="relative flex-shrink-0" ref={assignRef}>
        <button
          onClick={() => setAssignOpen(!assignOpen)}
          title="Assign member"
          className="flex items-center justify-center hover:ring-2 ring-blue-300 rounded-full transition-all"
        >
          {assignee ? (
            <MemberAvatar user={assignee} size={20} />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <User size={10} className="text-slate-400" />
            </div>
          )}
        </button>

        {assignOpen && (
          <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-44">
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50"
              onClick={() => { assignMember(null); setAssignOpen(false); }}
            >
              Unassign
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2"
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
  onClose: () => void;
  onItemUpdated: (updatedItem: BoardItemFull) => void;
}

export function CardDetailPanel({
  item,
  goals,
  milestones,
  members,
  onClose,
  onItemUpdated,
}: CardDetailPanelProps) {
  const [localItem, setLocalItem] = useState(item);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Live task list for milestone cards
  const [localTasks, setLocalTasks] = useState<TaskSimple[]>(
    item.linkedMilestone?.tasks ?? []
  );
  // Label for note cards
  const [noteLabel, setNoteLabel] = useState(item.label ?? "");

  const { sendEvent } = useWebSocket(localItem.workspaceId);

  // Keep local state in sync if item changes from outside (e.g. drag or WebSocket event)
  useEffect(() => {
    setLocalItem(item);
    setLocalTasks(item.linkedMilestone?.tasks ?? []);
    setNoteLabel(item.label ?? "");
  }, [item]);

  async function patchBoardItem(patch: Record<string, unknown>) {
    setSaving(true);
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

      // Broadcast card update over WebSocket
      sendEvent({
        type: "CARD_UPDATED",
        workspaceId: localItem.workspaceId,
        boardItem: merged,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
    setSaving(false);
  }

  // ── Goal link: links the board item to a goal
  async function handleGoalLink(goalId: string | null) {
    const goal = goalId ? goals.find((g) => g.id === goalId) ?? null : null;
    await patchBoardItem({ linkedGoalId: goalId });
    setLocalItem((prev) => ({ ...prev, linkedGoalId: goalId, linkedGoal: goal }));
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
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  // ── Save note label on blur
  async function saveNoteLabel() {
    if (noteLabel === localItem.label) return;
    await patchBoardItem({ label: noteLabel });
  }

  const entityType = localItem.entityType;
  const headerColors: Record<string, string> = {
    goal: "from-blue-500 to-blue-600",
    milestone: "from-violet-500 to-violet-600",
    task: "from-cyan-500 to-cyan-600",
    note: "from-amber-400 to-amber-500",
  };

  // Options for selects
  const goalOptions = goals.map((g) => ({
    id: g.id,
    label: g.title,
    sub: g.status,
  }));
  const milestoneOptions = milestones.map((m) => ({
    id: m.id,
    label: m.title,
    sub: `${m.tasks.filter((t) => t.status === "done").length}/${m.tasks.length} done`,
  }));

  const milestoneId = localItem.linkedMilestoneId ?? localItem.linkedMilestone?.id;

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-80 bg-white border-l border-slate-200 shadow-xl z-30 flex flex-col"
      style={{ animation: "slideInPanel 0.2s ease-out" }}
    >
      <style>{`
        @keyframes slideInPanel {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);   opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div className={`bg-gradient-to-r ${headerColors[entityType] ?? "from-slate-400 to-slate-500"} px-4 py-3 flex items-center justify-between`}>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
            {entityType}
          </span>
          <h2 className="text-sm font-bold text-white leading-tight truncate max-w-[210px]">
            {localItem.linkedGoal?.title ??
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
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">

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
          <div>
            {/* Link to goal */}
            <div className="relative">
              <SelectField
                label="Linked Goal"
                icon={<Link2 size={11} className="text-blue-500" />}
                value={localItem.linkedMilestone?.goalId ?? null}
                onChange={async (goalId) => {
                  await handleMilestoneGoalLink(goalId);
                }}
                options={goalOptions}
                placeholder="Link to a goal…"
              />
            </div>

            {/* Link milestone board card to a milestone entity */}
            {!localItem.linkedMilestoneId && (
              <div className="relative">
                <SelectField
                  label="Milestone"
                  icon={<Link2 size={11} className="text-violet-500" />}
                  value={localItem.linkedMilestoneId}
                  onChange={handleMilestoneLink}
                  options={milestoneOptions}
                  placeholder="Pick a milestone…"
                />
              </div>
            )}

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
            {localTasks.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                  Tasks
                  <span className="text-[10px] normal-case font-normal text-slate-400">
                    {localTasks.filter((t) => t.status === "done").length}/{localTasks.length} done
                  </span>
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
                        setLocalTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {localTasks.length === 0 && localItem.linkedMilestone && (
              <p className="text-[12px] text-slate-400 text-center py-4">No tasks in this milestone yet.</p>
            )}
          </div>
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
                        setLocalTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
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
