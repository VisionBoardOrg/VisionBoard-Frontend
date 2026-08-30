"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2, Circle, Clock, AlertTriangle,
  ChevronRight, Flame, ArrowUp, ArrowDown, Minus, Calendar,
} from "lucide-react";
import { TaskStatusDropdown } from "./TaskStatusDropdown";

type TaskStatus = "todo" | "in_progress" | "in_review" | "blocked" | "done";

const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string }> = {
  todo:        { label: "To Do",       icon: <Circle        size={13} className="text-muted" />,   color: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In Progress", icon: <Clock         size={13} className="text-blue" />,    color: "bg-blue-faint text-blue"     },
  in_review:   { label: "In Review",   icon: <Clock         size={13} className="text-cyan" />,    color: "bg-cyan-50 text-cyan-700"    },
  blocked:     { label: "Blocked",     icon: <AlertTriangle size={13} className="text-danger" />,  color: "bg-red-50 text-danger"       },
  done:        { label: "Done",        icon: <CheckCircle2  size={13} className="text-success" />, color: "bg-green-50 text-success"    },
};

const PRIORITY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: "Urgent", icon: <Flame     size={12} />, color: "text-danger"  },
  high:   { label: "High",   icon: <ArrowUp   size={12} />, color: "text-warning" },
  medium: { label: "Medium", icon: <Minus     size={12} />, color: "text-slate"   },
  low:    { label: "Low",    icon: <ArrowDown size={12} />, color: "text-muted"   },
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

interface TaskData {
  id: string;
  title: string;
  status: string;
  priority: string;
  storyPoints: number | null;
  dueDate?: Date | string | null;
  blockedReason?: string | null;
  milestone: {
    id: string;
    title: string;
    goal: { id: string; title: string };
  };

}

interface Props {
  tasks: TaskData[];
  workspaceId: string;
}

export function TasksFilteredList({ tasks, workspaceId }: Props) {
  const [activeFilter, setActiveFilter] = useState<TaskStatus | "all">("all");

  // Count per status for badge numbers
  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = activeFilter === "all"
    ? tasks
    : tasks.filter((t) => t.status === activeFilter);

  const grouped = STATUS_ORDER.reduce<Record<TaskStatus, TaskData[]>>(
    (acc, s) => {
      acc[s] = filtered.filter((t) => t.status === s);
      return acc;
    },
    { in_progress: [], blocked: [], in_review: [], todo: [], done: [] }
  );

  return (
    <div className="space-y-5">
      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_TABS.map(({ key, label }) => {
          const count = key === "all" ? tasks.length : (counts[key] ?? 0);
          const isActive = activeFilter === key;

          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors
                ${isActive
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

      {/* Task groups */}
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
                  const isOverdue =
                    task.dueDate &&
                    new Date(task.dueDate) < new Date() &&
                    task.status !== "done";

                  return (
                    <div
                      key={task.id}
                      className="bg-white rounded-2xl border border-border px-4 sm:px-5 py-4 flex items-start gap-4 hover:border-blue/30 transition-colors"
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
                            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                            <span className="leading-relaxed">{task.blockedReason}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-3 mt-2.5 flex-wrap text-xs text-muted">
                          <TaskStatusDropdown
                            taskId={task.id}
                            initialStatus={task.status as TaskStatus}
                            initialBlockedReason={task.blockedReason}
                          />

                          <Link
                            href={`/workspace/${workspaceId}/goals/${task.milestone.goal.id}`}
                            className="flex items-center gap-1 hover:text-blue transition-colors"
                          >
                            <span className="truncate max-w-[140px]">{task.milestone.goal.title}</span>
                            <ChevronRight size={10} />
                            <span className="truncate max-w-[120px]">{task.milestone.title}</span>
                          </Link>


                          {task.storyPoints != null && (
                            <span className="bg-offwhite border border-border px-2 py-0.5 rounded-full">
                              {task.storyPoints} pts
                            </span>
                          )}

                          {task.dueDate && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${
                              isOverdue
                                ? "bg-red-50 text-danger border-red-200 font-semibold"
                                : "bg-offwhite border-border text-slate"
                            }`}>
                              <Calendar size={10} className={isOverdue ? "text-danger" : "text-muted"} />
                              {isOverdue ? "Overdue · " : "Due "}
                              {new Date(task.dueDate).toLocaleDateString()}
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
    </div>
  );
}
