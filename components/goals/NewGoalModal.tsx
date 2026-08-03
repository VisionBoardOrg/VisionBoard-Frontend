"use client";

import { useEffect, useRef, useState } from "react";
import { Target, Check, X, Loader2 } from "lucide-react";

interface NewGoalModalProps {
  workspaceId: string;
  onClose: () => void;
  /** Called with the newly created goal after a successful POST */
  onCreated: (goal: { id: string; title: string; objective: string; status: string; targetDate: string | null; healthScore: number; keyResults: unknown; milestones: []; _count: { documents: number; comments: number } }) => void;
  /** When true, also accepts targetDate + status fields (goals page variant) */
  extended?: boolean;
}

export function NewGoalModal({ workspaceId, onClose, onCreated, extended = false }: NewGoalModalProps) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const o = objective.trim();
    if (!t || !o) { setError("Title and objective are required."); return; }

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          title: t,
          objective: o,
          targetDate: targetDate || null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create goal."); return; }
      onCreated({ ...data.goal, milestones: [], _count: { documents: 0, comments: 0 } });
      onClose();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Target size={16} className="text-blue" />
            New Goal
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-offwhite text-muted hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5">
              Goal Title <span className="text-danger">*</span>
            </label>
            <input
              ref={titleRef}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Launch v2.0 by Q3"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
            />
          </div>

          {/* Objective */}
          <div>
            <label className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5">
              Objective <span className="text-danger">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Describe what success looks like…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
            />
          </div>

          {/* Extended fields: target date + status */}
          {extended && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5">
                  Target date
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "active")}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue cursor-pointer"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                </select>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-xs text-danger bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate hover:bg-offwhite rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim() || !objective.trim()}
              className="px-4 py-2 text-sm font-semibold bg-blue text-white rounded-xl hover:bg-blue-mid disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {creating
                ? <><Loader2 size={13} className="animate-spin" /> Creating…</>
                : <><Check size={13} /> Create Goal</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
