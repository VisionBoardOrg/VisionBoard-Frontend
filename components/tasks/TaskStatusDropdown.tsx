"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  ChevronDown,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useModalA11y } from "@/hooks/useModalA11y";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "blocked" | "done";

const STATUS_META: Record<
  TaskStatus,
  { label: string; icon: React.ReactNode; color: string; dot: string }
> = {
  todo:        { label: "To Do",       icon: <Circle        size={13} aria-hidden="true" />, color: "bg-slate-100 text-slate-600", dot: "text-slate-400"   },
  in_progress: { label: "In Progress", icon: <Clock         size={13} aria-hidden="true" />, color: "bg-blue-faint text-blue",     dot: "text-blue-600"    },
  in_review:   { label: "In Review",   icon: <Clock         size={13} aria-hidden="true" />, color: "bg-cyan-50 text-cyan-700",    dot: "text-cyan-600"    },
  blocked:     { label: "Blocked",     icon: <AlertTriangle size={13} aria-hidden="true" />, color: "bg-red-50 text-danger",       dot: "text-red-500"     },
  done:        { label: "Done",        icon: <CheckCircle2  size={13} aria-hidden="true" />, color: "bg-green-50 text-success",    dot: "text-emerald-600" },
};

const STATUSES = Object.keys(STATUS_META) as TaskStatus[];

interface Props {
  taskId: string;
  initialStatus: TaskStatus;
  initialBlockedReason?: string | null;
  onStatusUpdated?: (nextStatus: TaskStatus, blockedReason: string | null) => void;
}

export function TaskStatusDropdown({
  taskId,
  initialStatus,
  initialBlockedReason,
  onStatusUpdated,
}: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [blockedReason, setBlockedReason] = useState<string>(initialBlockedReason ?? "");
  const [open, setOpen] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [pendingReason, setPendingReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const blockedModalRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  // Keep local state in sync when parent refreshes props
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    setBlockedReason(initialBlockedReason ?? "");
  }, [initialBlockedReason]);

  useModalA11y(blockedModalRef, () => setShowBlockedModal(false), showBlockedModal, {
    initialFocusRef: textareaRef,
  });

  // Only attach document listeners while THIS dropdown is open (avoids 200 idle listeners)
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function applyStatusChange(next: TaskStatus, reason?: string) {
    const prev = status;
    const prevReason = blockedReason;
    const nextReason = next === "blocked" ? (reason ?? null) : null;

    setStatus(next);
    setBlockedReason(nextReason ?? "");
    setOpen(false);
    onStatusUpdated?.(next, nextReason);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next,
          blockedReason: nextReason,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setStatus(prev);
        setBlockedReason(prevReason);
        onStatusUpdated?.(prev, prevReason || null);
        toast({
          type: "error",
          title: "Could not update task status",
          description: errData.error ?? "Status change failed and was reverted. Please try again.",
        });
        return;
      }

      startTransition(() => router.refresh());
    } catch {
      setStatus(prev);
      setBlockedReason(prevReason);
      onStatusUpdated?.(prev, prevReason || null);
      toast({
        type: "error",
        title: "Connection error",
        description: "Could not save task status. Check your network and try again.",
      });
    }
  }

  function changeStatus(next: TaskStatus) {
    if (next === status) {
      setOpen(false);
      return;
    }

    if (next === "blocked") {
      setOpen(false);
      setPendingReason(blockedReason);
      setShowBlockedModal(true);
      return;
    }

    applyStatusChange(next);
  }

  function confirmBlocked() {
    setShowBlockedModal(false);
    applyStatusChange("blocked", pendingReason.trim() || undefined);
  }

  const meta = STATUS_META[status] ?? STATUS_META.todo;

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={isPending}
          aria-expanded={open}
          aria-label={`Task status: ${meta.label}. Click to change.`}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-transparent
            hover:border-current/20 transition-colors select-none
            ${meta.color} ${isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className={meta.dot}>{meta.icon}</span>
          {meta.label}
          <ChevronDown
            size={11}
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div
            role="group"
            aria-label="Select task status"
            className="absolute left-0 top-full mt-1 z-50 bg-white border border-border rounded-xl shadow-lg py-1 w-44 min-w-max"
          >
            {STATUSES.map((s) => {
              const m = STATUS_META[s];
              return (
                <button
                  type="button"
                  key={s}
                  onClick={() => changeStatus(s)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-offwhite transition-colors cursor-pointer"
                >
                  <span className={m.dot}>{m.icon}</span>
                  <span className={s === status ? "font-semibold text-blue" : "text-ink"}>
                    {m.label}
                  </span>
                  {s === status && <Check size={11} className="text-blue ml-auto" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Blocked reason modal */}
      {showBlockedModal && (
        <dialog
          ref={blockedModalRef}
          {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
          aria-labelledby="blocked-modal-title"
          className="m-auto bg-white rounded-2xl shadow-xl border border-border w-full max-w-sm p-6 backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-danger" aria-hidden="true" />
                <h3 id="blocked-modal-title" className="font-semibold text-ink text-sm">
                  Mark as Blocked
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowBlockedModal(false)}
                className="p-1 rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate mb-3">
              Optionally describe why this task is blocked.
            </p>

            <textarea
              ref={textareaRef}
              value={pendingReason}
              onChange={(e) => setPendingReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmBlocked();
              }}
              placeholder="e.g. Waiting on design handoff, dependency not ready..."
              rows={3}
              maxLength={500}
              className="w-full text-xs border border-border rounded-xl px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-blue/30 text-ink placeholder:text-muted"
            />

            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowBlockedModal(false)}
                className="text-xs px-4 py-2 rounded-xl border border-border text-slate hover:bg-offwhite transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBlocked}
                className="text-xs px-4 py-2 rounded-xl bg-red-50 text-danger font-semibold hover:bg-red-100 transition-colors cursor-pointer"
              >
                Mark Blocked
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
