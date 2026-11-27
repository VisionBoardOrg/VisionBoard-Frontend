"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Flame,
  ArrowUp,
  ArrowDown,
  Minus,
  Calendar,
  Search,
  Plus,
  ListTodo,
  X,
  Loader2,
  LayoutGrid,
} from "lucide-react";
import { TaskStatusDropdown, type TaskStatus } from "./TaskStatusDropdown";
import { useToast } from "@/context/ToastContext";

const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  todo:        { label: "To Do",       icon: <Circle        size={13} className="text-muted"   aria-hidden="true" />, color: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", icon: <Clock         size={13} className="text-blue"    aria-hidden="true" />, color: "bg-blue-faint text-blue"     },
  in_review:   { label: "In Review",   icon: <Clock         size={13} className="text-cyan"    aria-hidden="true" />, color: "bg-cyan-50 text-cyan-700"    },
  blocked:     { label: "Blocked",     icon: <AlertTriangle size={13} className="text-danger"  aria-hidden="true" />, color: "bg-red-50 text-danger"       },
  done:        { label: "Done",        icon: <CheckCircle2  size={13} className="text-success" aria-hidden="true" />, color: "bg-green-50 text-success"    },
};

const PRIORITY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: "Urgent", icon: <Flame     size={12} aria-hidden="true" />, color: "text-danger"  },
  high:   { label: "High",   icon: <ArrowUp   size={12} aria-hidden="true" />, color: "text-warning" },
  medium: { label: "Medium", icon: <Minus     size={12} aria-hidden="true" />, color: "text-slate"   },
  low:    { label: "Low",    icon: <ArrowDown size={12} aria-hidden="true" />, color: "text-muted"   },
};

const PRIORITY_WEIGHT: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_ORDER: TaskStatus[] = ["in_progress", "blocked", "in_review", "todo", "done"];

const FILTER_TABS: { key: TaskStatus | "all"; label: string }[] = [
  { key: "all",         label: "All"         },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked",     label: "Blocked"     },
  { key: "in_review",   label: "In Review"   },
  { key: "todo",        label: "To Do"       },
  { key: "done",        label: "Done"        },
];

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deterministic date formatter (UTC YYYY-MM-DD → "Nov 21, 2026") to avoid SSR/client hydration mismatches. */
function formatDeterministicDate(dateInput: Date | string): string {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export interface TaskData {
  id: string;
  title: string;
  status: string;
  priority: string;
  storyPoints: number | null;
  dueDate?: Date | string | null;
  blockedReason?: string | null;
  assignees?: { userId: string; role: string }[];
  milestone: {
    id: string;
    title: string;
    goal: { id: string; title: string };
  };
}

export interface MilestoneOption {
  id: string;
  title: string;
  goalId: string;
  goalTitle: string;
}

interface Props {
  tasks: TaskData[];
  workspaceId: string;
  currentUserId: string;
  milestones?: MilestoneOption[];
  highlightedTaskId?: string | null;
  truncated?: boolean;
}

export function TasksFilteredList({
  tasks: initialTasks,
  workspaceId,
  currentUserId,
  milestones = [],
  highlightedTaskId = null,
  truncated = false,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskData[]>(initialTasks);
  const [scope, setScope] = useState<"my" | "all">(() => {
    // If deep-linking to a task not assigned to current user, default to "all" so it's visible!
    if (highlightedTaskId) {
      const target = initialTasks.find((t) => t.id === highlightedTaskId);
      if (target && !target.assignees?.some((a) => a.userId === currentUserId)) {
        return "all";
      }
    }
    return "my";
  });
  const [activeFilter, setActiveFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [todayStartMs, setTodayStartMs] = useState<number | null>(null);

  // Quick new task form state
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMilestoneId, setNewMilestoneId] = useState(milestones[0]?.id ?? "");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [assignToMe, setAssignToMe] = useState(true);
  const [creating, setCreating] = useState(false);

  const highlightedRef = useRef<HTMLDivElement>(null);
  const filterTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleFilterTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % FILTER_TABS.length;
    else if (e.key === "ArrowLeft") nextIdx = (idx - 1 + FILTER_TABS.length) % FILTER_TABS.length;
    else if (e.key === "Home") nextIdx = 0;
    else if (e.key === "End") nextIdx = FILTER_TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      setActiveFilter(FILTER_TABS[nextIdx].key);
      const nextBtn = filterTabRefs.current[nextIdx];
      nextBtn?.focus();
      nextBtn?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // Sync when server props refresh
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Compute local start-of-day on client after hydration so "Due today" vs "Overdue" is accurate without hydration mismatch
  useEffect(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setTodayStartMs(now.getTime());
  }, []);

  // Scroll deep-linked task into view
  useEffect(() => {
    if (highlightedTaskId && highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedTaskId, scope]);

  // Scope filter: My Tasks vs All Workspace Tasks
  const scopedTasks = useMemo(() => {
    if (scope === "all") return tasks;
    return tasks.filter((t) => t.assignees?.some((a) => a.userId === currentUserId));
  }, [tasks, scope, currentUserId]);

  // Search + priority filter (before status tabs so badge counts reflect active search/priority/scope)
  const searchedAndPrioritized = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedTasks
      .filter((t) => {
        if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.milestone.title.toLowerCase().includes(q) ||
          t.milestone.goal.title.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const wDiff = (PRIORITY_WEIGHT[b.priority] ?? 2) - (PRIORITY_WEIGHT[a.priority] ?? 2);
        if (wDiff !== 0) return wDiff;
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDue - bDue;
      });
  }, [scopedTasks, searchQuery, priorityFilter]);

  const counts = useMemo(
    () =>
      searchedAndPrioritized.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1;
        return acc;
      }, {}),
    [searchedAndPrioritized]
  );

  const filtered = useMemo(
    () =>
      activeFilter === "all"
        ? searchedAndPrioritized
        : searchedAndPrioritized.filter((t) => t.status === activeFilter),
    [searchedAndPrioritized, activeFilter]
  );

  const grouped = useMemo(
    () =>
      STATUS_ORDER.reduce<Record<TaskStatus, TaskData[]>>(
        (acc, s) => {
          acc[s] = filtered.filter((t) => t.status === s);
          return acc;
        },
        { in_progress: [], blocked: [], in_review: [], todo: [], done: [] }
      ),
    [filtered]
  );

  const myTaskCount = useMemo(
    () => tasks.filter((t) => t.assignees?.some((a) => a.userId === currentUserId)).length,
    [tasks, currentUserId]
  );

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    const targetMilestoneId = newMilestoneId || milestones[0]?.id;
    if (!title || !targetMilestoneId || creating) return;

    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneId: targetMilestoneId,
          title,
          priority: newPriority,
          dueDate: newDueDate ? new Date(newDueDate).toISOString() : undefined,
          assignees: assignToMe ? [{ userId: currentUserId, role: "owner" }] : undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({
          type: "error",
          title: "Could not create task",
          description: errData.error ?? "Failed to create task. Please try again.",
        });
        return;
      }

      const data = await res.json();
      const msMeta = milestones.find((m) => m.id === targetMilestoneId);
      const created: TaskData = {
        id: data.task.id,
        title: data.task.title,
        status: data.task.status ?? "todo",
        priority: data.task.priority ?? newPriority,
        storyPoints: data.task.storyPoints ?? null,
        dueDate: data.task.dueDate ?? null,
        blockedReason: null,
        assignees: assignToMe ? [{ userId: currentUserId, role: "owner" }] : [],
        milestone: {
          id: targetMilestoneId,
          title: msMeta?.title ?? "Milestone",
          goal: {
            id: msMeta?.goalId ?? "",
            title: msMeta?.goalTitle ?? "Goal",
          },
        },
      };

      setTasks((prev) => [created, ...prev]);
      setNewTitle("");
      setNewDueDate("");
      setNewPriority("medium");
      setShowNewTaskForm(false);
      if (!assignToMe && scope === "my") {
        setScope("all");
      }
      toast({
        type: "success",
        title: "Task created",
        description: `Added “${created.title}”.`,
      });
      router.refresh();
    } catch {
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not create task. Check your network and try again.",
      });
    } finally {
      setCreating(false);
    }
  }

  function resetAllFilters() {
    setActiveFilter("all");
    setPriorityFilter("all");
    setSearchQuery("");
  }

  const hasActiveFilters = activeFilter !== "all" || priorityFilter !== "all" || searchQuery.trim() !== "";

  return (
    <div className="space-y-5">
      {/* Truncation notice when hitting 200-task query limit */}
      {truncated && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between gap-3">
          <span>
            Showing the first 200 tasks in this workspace. Use the search bar or view a specific Goal to inspect older tasks.
          </span>
        </div>
      )}

      {/* Controls Row: Scope toggle, Search, Priority filter, New Task */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* My Tasks / All Tasks segmented toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 border border-border">
            <button
              type="button"
              aria-pressed={scope === "my"}
              onClick={() => setScope("my")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                scope === "my"
                  ? "bg-white text-ink shadow-xs"
                  : "text-slate hover:text-ink"
              }`}
            >
              My Tasks ({myTaskCount})
            </button>
            <button
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                scope === "all"
                  ? "bg-white text-ink shadow-xs"
                  : "text-slate hover:text-ink"
              }`}
            >
              All Workspace ({tasks.length})
            </button>
          </div>

          {/* Search input */}
          <div className="relative flex-1 sm:flex-initial sm:w-64 min-w-[180px]">
            <Search
              size={14}
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks, goals…"
              aria-label="Search tasks"
              className="w-full pl-8 pr-7 py-2 text-xs bg-white border border-border rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Priority filter */}
          <select
            aria-label="Filter by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs bg-white border border-border rounded-xl px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 cursor-pointer"
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* New Task trigger */}
        <div className="flex items-center gap-2">
          {milestones.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNewTaskForm((v) => !v)}
              className="inline-flex items-center gap-1.5 bg-blue text-white text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-blue-mid transition-colors cursor-pointer"
            >
              <Plus size={14} aria-hidden="true" />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* Inline Quick New Task Form */}
      {showNewTaskForm && milestones.length > 0 && (
        <form
          onSubmit={handleCreateTask}
          className="bg-white rounded-2xl border border-blue/30 shadow-sm p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate">New Task</h2>
            <button
              type="button"
              aria-label="Close new task form"
              onClick={() => setShowNewTaskForm(false)}
              className="text-muted hover:text-ink p-1 rounded-lg cursor-pointer"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title…"
              required
              autoFocus
              className="sm:col-span-2 text-sm border border-border rounded-xl px-3 py-2 text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30"
            />
            <select
              aria-label="Milestone"
              value={newMilestoneId || milestones[0]?.id || ""}
              onChange={(e) => setNewMilestoneId(e.target.value)}
              className="text-xs border border-border rounded-xl px-3 py-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
            >
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.goalTitle} → {m.title}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <select
                aria-label="Priority"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as "low" | "medium" | "high" | "urgent")}
                className="flex-1 text-xs border border-border rounded-xl px-2.5 py-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
              <input
                type="date"
                aria-label="Due date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="flex-1 text-xs border border-border rounded-xl px-2.5 py-2 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate cursor-pointer">
              <input
                type="checkbox"
                checked={assignToMe}
                onChange={(e) => setAssignToMe(e.target.checked)}
                className="rounded border-border text-blue focus:ring-blue/30"
              />
              Assign to me
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewTaskForm(false)}
                className="text-xs px-3 py-1.5 rounded-xl border border-border text-slate hover:bg-offwhite transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-xl bg-blue text-white hover:bg-blue-mid disabled:opacity-50 transition-colors cursor-pointer"
              >
                {creating && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                {creating ? "Creating…" : "Create Task"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Status Filter Tabs (accessible tablist) */}
      <div
        role="tablist"
        aria-label="Filter tasks by status"
        className="tablist-scroller flex items-center gap-1.5 flex-wrap"
      >
        {FILTER_TABS.map(({ key, label }, idx) => {
          const count = key === "all" ? searchedAndPrioritized.length : (counts[key] ?? 0);
          const isActive = activeFilter === key;

          return (
            <button
              key={key}
              ref={(el) => { filterTabRefs.current[idx] = el; }}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => {
                setActiveFilter(key);
                filterTabRefs.current[idx]?.scrollIntoView({ block: "nearest", inline: "nearest" });
              }}
              onKeyDown={(e) => handleFilterTabKeyDown(e, idx)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer
                ${
                  isActive
                    ? "bg-blue text-white border-blue shadow-sm"
                    : "bg-white text-slate border-border hover:border-blue/40 hover:text-ink"
                }`}
            >
              {label}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center
                  ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty state when current filter / scope has 0 tasks */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <ListTodo size={36} className="text-muted mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-semibold text-ink text-sm">
            {hasActiveFilters
              ? "No tasks match your current filters"
              : scope === "my"
              ? "No tasks assigned to you"
              : "No tasks in this workspace yet"}
          </h3>
          <p className="text-xs text-slate mt-1 mb-5">
            {hasActiveFilters
              ? "Try clearing your search, priority, or status filter."
              : scope === "my" && tasks.length > 0
              ? `There are ${tasks.length} task${tasks.length === 1 ? "" : "s"} across the workspace.`
              : "Create a task above or add milestones on the board to get started."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1.5 bg-blue text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-blue-mid transition-colors cursor-pointer"
              >
                Show all tasks
              </button>
            )}
            {scope === "my" && tasks.length > 0 && !hasActiveFilters && (
              <button
                type="button"
                onClick={() => setScope("all")}
                className="inline-flex items-center gap-1.5 bg-blue text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-blue-mid transition-colors cursor-pointer"
              >
                View all workspace tasks
              </button>
            )}
            <Link
              href={`/workspace/${workspaceId}/board`}
              className="inline-flex items-center gap-1.5 border border-border bg-white text-ink rounded-xl px-4 py-2 text-xs font-semibold hover:bg-offwhite transition-colors"
            >
              <LayoutGrid size={13} aria-hidden="true" />
              Open Board
            </Link>
          </div>
        </div>
      ) : (
        /* Task groups */
        <div className="space-y-6">
          {STATUS_ORDER.map((status) => {
            const group = grouped[status];
            if (group.length === 0) return null;
            const meta = STATUS_META[status];

            return (
              <section key={status}>
                <div className="flex items-center gap-2 mb-3">
                  {meta.icon}
                  <h2 className="text-sm font-semibold text-ink">{meta.label}</h2>
                  <span className="text-xs text-muted">({group.length})</span>
                </div>

                <div className="space-y-2">
                  {group.map((task) => {
                    const pm = PRIORITY_META[task.priority] ?? PRIORITY_META.medium;
                    const isHighlighted = highlightedTaskId === task.id;

                    // Compare against local start-of-day so tasks due TODAY say "Due today", not "Overdue"
                    let dueState: "overdue" | "today" | "upcoming" = "upcoming";
                    if (task.dueDate && task.status !== "done" && todayStartMs !== null) {
                      const due = new Date(task.dueDate);
                      if (!isNaN(due.getTime())) {
                        const dueDayStart = new Date(
                          due.getUTCFullYear(),
                          due.getUTCMonth(),
                          due.getUTCDate()
                        ).getTime();
                        if (dueDayStart < todayStartMs) {
                          dueState = "overdue";
                        } else if (dueDayStart === todayStartMs) {
                          dueState = "today";
                        }
                      }
                    }

                    return (
                      <div
                        key={task.id}
                        ref={isHighlighted ? highlightedRef : undefined}
                        className={`bg-white rounded-2xl border px-4 sm:px-5 py-4 flex items-start gap-4 transition-colors ${
                          isHighlighted
                            ? "border-blue ring-2 ring-blue/25 bg-blue-faint/20"
                            : "border-border hover:border-blue/30"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <p
                              className={`text-sm font-medium leading-snug ${
                                task.status === "done" ? "line-through text-muted" : "text-ink"
                              }`}
                            >
                              {task.title}
                            </p>
                            <div className={`flex items-center gap-1 text-xs shrink-0 ${pm.color}`}>
                              {pm.icon}
                              <span className="hidden sm:inline">{pm.label}</span>
                            </div>
                          </div>

                          {/* Blocked reason */}
                          {task.status === "blocked" && task.blockedReason && (
                            <div className="mt-2 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-danger">
                              <AlertTriangle size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <span className="leading-relaxed">{task.blockedReason}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-2.5 flex-wrap text-xs text-muted">
                            <TaskStatusDropdown
                              taskId={task.id}
                              initialStatus={task.status as TaskStatus}
                              initialBlockedReason={task.blockedReason}
                              onStatusUpdated={(nextStatus, nextBlockedReason) => {
                                setTasks((prev) =>
                                  prev.map((t) =>
                                    t.id === task.id
                                      ? { ...t, status: nextStatus, blockedReason: nextBlockedReason }
                                      : t
                                  )
                                );
                              }}
                            />

                            <Link
                              href={`/workspace/${workspaceId}/goals/${task.milestone.goal.id}`}
                              className="flex items-center gap-1 hover:text-blue transition-colors"
                            >
                              <span className="truncate max-w-[140px]">
                                {task.milestone.goal.title}
                              </span>
                              <ChevronRight size={10} aria-hidden="true" />
                              <span className="truncate max-w-[120px]">
                                {task.milestone.title}
                              </span>
                            </Link>

                            {task.storyPoints != null && (
                              <span className="bg-offwhite border border-border px-2 py-0.5 rounded-full">
                                {task.storyPoints} pts
                              </span>
                            )}

                            {task.dueDate && (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
                                  dueState === "overdue"
                                    ? "bg-red-50 text-danger border-red-200 font-semibold"
                                    : dueState === "today"
                                    ? "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
                                    : "bg-offwhite border-border text-slate"
                                }`}
                              >
                                <Calendar
                                  size={10}
                                  aria-hidden="true"
                                  className={
                                    dueState === "overdue"
                                      ? "text-danger"
                                      : dueState === "today"
                                      ? "text-amber-600"
                                      : "text-muted"
                                  }
                                />
                                {dueState === "overdue"
                                  ? `Overdue · ${formatDeterministicDate(task.dueDate)}`
                                  : dueState === "today"
                                  ? "Due today"
                                  : `Due ${formatDeterministicDate(task.dueDate)}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
