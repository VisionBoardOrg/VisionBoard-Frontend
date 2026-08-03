"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, Circle, Clock, AlertTriangle, ChevronDown, Check, X,
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
  initialBlockedReason?: string | null;
}

export function TaskStatusDropdown({ taskId, initialStatus, initialBlockedReason }: Props) {
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [blockedReason, setBlockedReason] = useState<string>(initialBlockedReason ?? "");
  const [open, setOpen] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [pendingReason, setPendingReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  async function applyStatusChange(next: TaskStatus, reason?: string) {
    const prev = status;
    const prevReason = blockedReason;

    setStatus(next);
    if (next === "blocked") setBlockedReason(reason ?? "");
    else setBlockedReason("");
    setOpen(false);

    try {
      const body: Record<string, unknown> = { status: next };
      if (next === "blocked") body.blockedReason = reason ?? null;
      else body.blockedReason = null;

      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setStatus(prev);
        setBlockedReason(prevReason);
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setStatus(prev);
      setBlockedReason(prevReason);
    }
  }

  function changeStatus(next: TaskStatus) {
    if (next === status) { setOpen(false); return; }

    if (next === "blocked") {
      setOpen(false);
      setPendingReason("");
      setShowBlockedModal(true);
      return;
    }

    applyStatusChange(next);
  }

  function confirmBlocked() {
    setShowBlockedModal(false);
    applyStatusChange("blocked", pendingReason.trim() || undefined);
  }

  const meta = STATUS_META[status];

  return (
    <>
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

      {/* Blocked reason modal */}
      {showBlockedModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowBlockedModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl border border-border w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-danger" />
                <h3 className="font-semibold text-ink text-sm">Mark as Blocked</h3>
              </div>
              <button
                onClick={() => setShowBlockedModal(false)}
                className="text-muted hover:text-ink transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate mb-3">
              Optionally describe why this task is blocked.
            </p>

            <textarea
              autoFocus
              value={pendingReason}
              onChange={(e) => setPendingReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmBlocked(); }}
              placeholder="e.g. Waiting on design handoff, dependency not ready..."
              rows={3}
              maxLength={500}
              className="w-full text-xs border border-border rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue/30 text-ink placeholder:text-muted"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => setShowBlockedModal(false)}
                className="text-xs px-4 py-2 rounded-xl border border-border text-slate hover:bg-offwhite transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlocked}
                className="text-xs px-4 py-2 rounded-xl bg-red-50 text-danger font-semibold hover:bg-red-100 transition-colors"
              >
                Mark Blocked
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
