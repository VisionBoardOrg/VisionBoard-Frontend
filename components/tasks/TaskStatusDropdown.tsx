"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Circle, Clock, AlertTriangle, ChevronDown, Check,
} from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "in_review" | "blocked" | "done";

const STATUS_META: Record<TaskStatus, { label: string; icon: React.ReactNode; color: string; dot: string }> = {
  todo:        { label: "To Do",       icon: <Circle        size={13} />, color: "bg-slate-100 text-slate-600", dot: "text-slate-400"   },
  in_progress: { label: "In Progress", icon: <Clock         size={13} />, color: "bg-blue-faint text-blue",     dot: "text-blue-600"    },
  in_review:   { label: "In Review",   icon: <Clock         size={13} />, color: "bg-cyan-50 text-cyan-700",    dot: "text-cyan-600"    },
  blocked:     { label: "Blocked",     icon: <AlertTriangle size={13} />, color: "bg-red-50 text-danger",       dot: "text-red-500"     },
  done:        { label: "Done",        icon: <CheckCircle2  size={13} />, color: "bg-green-50 text-success",    dot: "text-emerald-600" },
};

const STATUSES = Object.keys(STATUS_META) as TaskStatus[];

interface Props {
  taskId: string;
  initialStatus: TaskStatus;
  milestoneId: string;
  workspaceId: string;
}

export function TaskStatusDropdown({ taskId, initialStatus, milestoneId, workspaceId }: Props) {
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function changeStatus(next: TaskStatus) {
    if (next === status) { setOpen(false); return; }

    const prev = status;
    setStatus(next); // optimistic update
    setOpen(false);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!res.ok) {
        setStatus(prev); // revert on failure
        return;
      }

      // Broadcast to the board page via WebSocket so the board store updates live
      try {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000/ws";
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: "TASK_UPDATED",
            workspaceId,
            milestoneId,
            taskId,
            status: next,
          }));
          ws.close();
        };
      } catch {
        // WS broadcast is best-effort; don't block or revert on WS failure
      }

      // Refresh the server component so tasks re-group by status
      startTransition(() => router.refresh());
    } catch {
      setStatus(prev); // revert on network error
    }
  }

  const meta = STATUS_META[status];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-transparent
          hover:border-current/20 transition-colors select-none
          ${meta.color} ${isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={meta.dot}>{meta.icon}</span>
        {meta.label}
        <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-lg py-1 w-44 min-w-max">
          {STATUSES.map((s) => {
            const m = STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-offwhite transition-colors"
              >
                <span className={m.dot}>{m.icon}</span>
                <span className={s === status ? "font-semibold text-blue" : "text-ink"}>{m.label}</span>
                {s === status && <Check size={11} className="text-blue ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
