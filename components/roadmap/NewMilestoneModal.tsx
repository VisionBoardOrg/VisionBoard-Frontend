"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Plus, Layers, Link2, AlertCircle, Target } from "lucide-react";
import { GanttMilestone, addDays, formatPlainDateInput } from "@/lib/gantt-engine";
import { useModalA11y } from "@/hooks/useModalA11y";

interface NewMilestoneModalProps {
  isOpen: boolean;
  workspaceId: string;
  defaultGoalId?: string;
  goals: Array<{ id: string; title: string }>;
  allMilestones: GanttMilestone[];
  onClose: () => void;
  onCreated: (newMilestone: GanttMilestone) => void;
  onCreateGoalClick?: () => void;
}

function defaultStartDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return formatPlainDateInput(`${y}-${m}-${d}`);
}

function defaultTargetDateStr() {
  const target = addDays(new Date(), 14);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, "0");
  const d = String(target.getDate()).padStart(2, "0");
  return formatPlainDateInput(`${y}-${m}-${d}`);
}

export function NewMilestoneModal({
  isOpen,
  workspaceId,
  defaultGoalId,
  goals,
  allMilestones,
  onClose,
  onCreated,
  onCreateGoalClick,
}: NewMilestoneModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState(defaultGoalId || goals[0]?.id || "");
  const [startDate, setStartDate] = useState(defaultStartDateStr);
  const [targetDate, setTargetDate] = useState(defaultTargetDateStr);
  const [status, setStatus] = useState("planned");
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [selectedPred, setSelectedPred] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useModalA11y(dialogRef, onClose, isOpen);

  // Sync goalId and reset form whenever modal opens or defaultGoalId/goals changes
  useEffect(() => {
    if (!isOpen) return;
    setTitle("");
    setDescription("");
    setStartDate(defaultStartDateStr());
    setTargetDate(defaultTargetDateStr());
    setStatus("planned");
    setDependsOn([]);
    setSelectedPred("");
    setError("");
    const validDefault =
      defaultGoalId && goals.some((g) => g.id === defaultGoalId)
        ? defaultGoalId
        : goals[0]?.id || "";
    setGoalId(validDefault);
  }, [isOpen, defaultGoalId, goals]);

  if (!isOpen) return null;

  function handleAddPredecessor() {
    if (!selectedPred) return;
    setDependsOn((prev) => (prev.includes(selectedPred) ? prev : [...prev, selectedPred]));
    setSelectedPred("");
  }

  function handleRemovePredecessor(id: string) {
    setDependsOn((prev) => prev.filter((p) => p !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !goalId) {
      setError("Title and goal are required.");
      return;
    }

    if (startDate && targetDate && new Date(startDate) > new Date(targetDate)) {
      setError("Start date cannot be after target date.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          goalId,
          title: title.trim(),
          description: description.trim(),
          startDate: startDate ? new Date(startDate).toISOString() : null,
          targetDate: targetDate ? new Date(targetDate).toISOString() : null,
          status,
          dependsOn,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create milestone");
        return;
      }

      onCreated(data.milestone);
      onClose();
    } catch (err) {
      console.error("Create milestone error:", err);
      setError("An unexpected error occurred.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="new-milestone-modal-title"
      className="m-auto bg-white rounded-2xl border border-border shadow-2xl max-w-md w-[calc(100%-2rem)] p-6 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90dvh] overflow-y-auto backdrop:bg-ink/40 backdrop:backdrop-blur-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center">
            <Layers size={16} className="text-blue" aria-hidden="true" />
          </div>
          <h1 id="new-milestone-modal-title" className="font-bold text-ink text-base">
            New Milestone
          </h1>
        </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-w-7 min-h-7 flex items-center justify-center text-muted hover:text-ink p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-1.5"
          >
            <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {goals.length === 0 ? (
          <div className="p-6 bg-slate-50 border border-border rounded-xl text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center mx-auto text-blue">
              <Target size={18} aria-hidden="true" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">No Goals Found</h4>
              <p className="text-xs text-slate mt-0.5 max-w-xs mx-auto">
                You need at least one goal in this workspace before creating standalone milestones.
              </p>
            </div>
            {onCreateGoalClick && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCreateGoalClick();
                }}
                className="inline-flex items-center gap-1.5 bg-blue text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-blue-mid transition-all shadow-xs cursor-pointer"
              >
                <Plus size={13} aria-hidden="true" />
                <span>Create a Goal</span>
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label
                htmlFor="new-milestone-title"
                className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1"
              >
                Title *
              </label>
              <input
                id="new-milestone-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Beta Launch & User Onboarding"
                className="w-full text-sm text-ink px-3.5 py-2.5 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
              />
            </div>

            {/* Parent Goal & Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="new-milestone-goal"
                  className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1"
                >
                  Parent Goal *
                </label>
                <select
                  id="new-milestone-goal"
                  value={goalId}
                  onChange={(e) => setGoalId(e.target.value)}
                  className="w-full text-xs text-ink px-3 py-2.5 bg-white border border-border rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                >
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="new-milestone-status"
                  className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1"
                >
                  Status
                </label>
                <select
                  id="new-milestone-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full text-xs text-ink px-3 py-2.5 bg-white border border-border rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="new-milestone-start"
                  className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1"
                >
                  Start Date
                </label>
                <input
                  id="new-milestone-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full text-xs text-ink px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:border-blue"
                />
              </div>
              <div>
                <label
                  htmlFor="new-milestone-target"
                  className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1"
                >
                  Target Date
                </label>
                <input
                  id="new-milestone-target"
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    setTargetDate(e.target.value);
                    if (error) setError("");
                  }}
                  className="w-full text-xs text-ink px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:border-blue"
                />
              </div>
            </div>

            {/* Predecessors */}
            <div className="space-y-1.5">
              <label
                htmlFor="new-milestone-predecessor"
                className="text-xs font-semibold text-slate uppercase tracking-wider flex items-center gap-1"
              >
                <Link2 size={13} className="text-blue" aria-hidden="true" />
                Predecessor Dependencies
              </label>
              {dependsOn.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {dependsOn.map((id) => {
                    const m = allMilestones.find((x) => x.id === id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-1 rounded-lg border border-border"
                      >
                        <span>{m ? m.title : id}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePredecessor(id)}
                          aria-label={`Remove ${m ? m.title : id}`}
                          className="hover:text-danger cursor-pointer"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  id="new-milestone-predecessor"
                  value={selectedPred}
                  onChange={(e) => setSelectedPred(e.target.value)}
                  className="flex-1 text-xs text-ink px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:border-blue"
                >
                  <option value="">+ Add Predecessor…</option>
                  {allMilestones
                    .filter((m) => !dependsOn.includes(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.goalTitle || "Goal"})
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddPredecessor}
                  disabled={!selectedPred}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-ink transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="new-milestone-description"
                className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1"
              >
                Description
              </label>
              <textarea
                id="new-milestone-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Key deliverables or scope…"
                rows={2}
                className="w-full text-xs text-ink px-3 py-2 border border-border rounded-xl resize-none focus:outline-none focus:border-blue"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-border text-xs font-semibold text-slate hover:text-ink hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 bg-blue text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-blue-mid transition-all disabled:opacity-50 shadow-xs cursor-pointer"
              >
                <Plus size={14} aria-hidden="true" />
                {submitting ? "Creating…" : "Create Milestone"}
              </button>
            </div>
          </form>
        )}
    </dialog>
  );
}
