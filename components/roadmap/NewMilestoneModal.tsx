"use client";

import React, { useState } from "react";
import { X, Plus, Layers, Link2, AlertCircle } from "lucide-react";
import { GanttMilestone } from "@/lib/gantt-engine";

interface NewMilestoneModalProps {
  isOpen: boolean;
  workspaceId: string;
  defaultGoalId?: string;
  goals: Array<{ id: string; title: string }>;
  allMilestones: GanttMilestone[];
  onClose: () => void;
  onCreated: (newMilestone: GanttMilestone) => void;
}

export function NewMilestoneModal({
  isOpen,
  workspaceId,
  defaultGoalId,
  goals,
  allMilestones,
  onClose,
  onCreated,
}: NewMilestoneModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState(defaultGoalId || goals[0]?.id || "");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [targetDate, setTargetDate] = useState(() =>
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [status, setStatus] = useState("planned");
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [selectedPred, setSelectedPred] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  function handleAddPredecessor() {
    if (!selectedPred) return;
    setDependsOn([...dependsOn, selectedPred]);
    setSelectedPred("");
  }

  function handleRemovePredecessor(id: string) {
    setDependsOn(dependsOn.filter((p) => p !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !goalId) {
      setError("Title and goal are required.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center">
              <Layers size={16} className="text-blue" />
            </div>
            <h3 className="font-bold text-ink text-base">New Milestone</h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink p-1 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-1.5">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1">
              Title *
            </label>
            <input
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
              <label className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1">
                Parent Goal *
              </label>
              <select
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
              <label className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1">
                Status
              </label>
              <select
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
              <label className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs text-ink px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:border-blue"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full text-xs text-ink px-3 py-2 bg-white border border-border rounded-xl focus:outline-none focus:border-blue"
              />
            </div>
          </div>

          {/* Predecessors */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate uppercase tracking-wider flex items-center gap-1">
              <Link2 size={13} className="text-blue" />
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
                        className="hover:text-danger"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <select
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
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-ink transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-slate uppercase tracking-wider block mb-1">
              Description
            </label>
            <textarea
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
              className="flex-1 px-4 py-2.5 border border-border text-xs font-semibold text-slate hover:text-ink hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-blue-mid transition-all disabled:opacity-50 shadow-xs"
            >
              <Plus size={14} />
              {submitting ? "Creating…" : "Create Milestone"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
