"use client";

import { useEffect, useRef, useState } from "react";
import { Target, Check, X, Loader2, Plus, Trash2 } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";

interface InitialKeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
}

interface NewGoalModalProps {
  workspaceId: string;
  onClose: () => void;
  /** Called with the newly created goal after a successful POST */
  onCreated: (goal: {
    id: string;
    title: string;
    objective: string;
    status: string;
    targetDate: string | null;
    healthScore: number;
    keyResults: unknown;
    milestones: [];
    _count: { documents: number; comments: number };
  }) => void;
  /** When true, also accepts targetDate + status fields (goals page variant) */
  extended?: boolean;
}

export function NewGoalModal({ workspaceId, onClose, onCreated, extended = false }: NewGoalModalProps) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState<"draft" | "active">("active");
  const [keyResults, setKeyResults] = useState<InitialKeyResult[]>([]);
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("100");
  const [krUnit, setKrUnit] = useState("%");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);

  useEffect(() => {
    const timer = setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  function handleAddKeyResult() {
    const trimmed = krTitle.trim();
    const numericTarget = Number(krTarget);
    if (!trimmed) return;
    if (!Number.isFinite(numericTarget) || numericTarget <= 0) {
      setError("Key result target must be a positive number.");
      return;
    }
    setError("");
    setKeyResults((prev) => [
      ...prev,
      {
        id: `kr-${Date.now()}-${prev.length}`,
        title: trimmed,
        target: numericTarget,
        current: 0,
        unit: krUnit.trim() || "%",
      },
    ]);
    setKrTitle("");
    setKrTarget("100");
    setKrUnit("%");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const o = objective.trim();
    if (!t || !o) {
      setError("Title and objective are required.");
      return;
    }

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
          keyResults,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create goal.");
        return;
      }
      onCreated({ ...data.goal, milestones: [], _count: { documents: 0, comments: 0 } });
      onClose();
    } catch {
      setError("Network error. Please check your connection and try again.");
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-goal-modal-title"
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 id="new-goal-modal-title" className="text-base font-bold text-ink flex items-center gap-2">
            <Target size={16} className="text-blue" aria-hidden="true" />
            New Goal
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-lg hover:bg-offwhite text-muted hover:text-ink transition-colors cursor-pointer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label
              htmlFor="new-goal-title"
              className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5"
            >
              Goal Title <span className="text-danger">*</span>
            </label>
            <input
              id="new-goal-title"
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
            <label
              htmlFor="new-goal-objective"
              className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5"
            >
              Objective <span className="text-danger">*</span>
            </label>
            <textarea
              id="new-goal-objective"
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
                <label
                  htmlFor="new-goal-target-date"
                  className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5"
                >
                  Target date
                </label>
                <input
                  id="new-goal-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                />
              </div>
              <div>
                <label
                  htmlFor="new-goal-status"
                  className="block text-[11px] font-semibold text-slate uppercase tracking-wider mb-1.5"
                >
                  Status
                </label>
                <select
                  id="new-goal-status"
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

          {/* Optional Initial Key Results */}
          <div className="space-y-2 pt-1 border-t border-border">
            <label
              htmlFor="new-goal-kr-title"
              className="block text-[11px] font-semibold text-slate uppercase tracking-wider"
            >
              Key Results <span className="text-muted font-normal normal-case">(optional)</span>
            </label>
            {keyResults.length > 0 && (
              <div className="space-y-1.5">
                {keyResults.map((kr) => (
                  <div
                    key={kr.id}
                    className="flex items-center justify-between gap-2 bg-offwhite border border-border rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-ink truncate">
                      {kr.title} <span className="text-muted">({kr.target} {kr.unit})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setKeyResults((prev) => prev.filter((x) => x.id !== kr.id))}
                      aria-label={`Remove key result ${kr.title}`}
                      className="text-muted hover:text-danger p-0.5 cursor-pointer"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-12 gap-1.5">
              <input
                id="new-goal-kr-title"
                type="text"
                value={krTitle}
                onChange={(e) => setKrTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddKeyResult();
                  }
                }}
                placeholder="e.g. Reach 500 weekly active teams"
                className="col-span-6 border border-border rounded-lg px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-blue"
              />
              <input
                type="number"
                min={1}
                step="any"
                value={krTarget}
                onChange={(e) => setKrTarget(e.target.value)}
                aria-label="Key result target value"
                placeholder="Target"
                className="col-span-3 border border-border rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue"
              />
              <input
                type="text"
                value={krUnit}
                onChange={(e) => setKrUnit(e.target.value)}
                aria-label="Key result unit"
                placeholder="Unit"
                className="col-span-2 border border-border rounded-lg px-2 py-1.5 text-xs text-ink focus:outline-none focus:border-blue"
              />
              <button
                type="button"
                onClick={handleAddKeyResult}
                disabled={!krTitle.trim()}
                aria-label="Add key result"
                className="col-span-1 flex items-center justify-center bg-offwhite hover:bg-blue-faint text-blue border border-border rounded-lg disabled:opacity-40 cursor-pointer"
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p
              role="alert"
              className="text-xs text-danger bg-red-50 border border-red-200 px-3 py-2 rounded-lg"
            >
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate hover:bg-offwhite rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim() || !objective.trim()}
              className="px-4 py-2 text-sm font-semibold bg-blue text-white rounded-xl hover:bg-blue-mid disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
            >
              {creating ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Creating…
                </>
              ) : (
                <>
                  <Check size={13} aria-hidden="true" /> Create Goal
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
