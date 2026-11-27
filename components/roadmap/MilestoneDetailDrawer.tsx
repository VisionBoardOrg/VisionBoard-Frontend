"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  X,
  Calendar,
  Link2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  ArrowRight,
  Layers,
} from "lucide-react";
import {
  GanttMilestone,
  canAddDependency,
  calculateBaselineVariance,
  formatPlainDateInput,
} from "@/lib/gantt-engine";
import { useConfirm } from "@/context/ConfirmContext";
import { useModalA11y } from "@/hooks/useModalA11y";
import { SingleLineOverflow } from "@/components/ui/SingleLineOverflow";

interface MilestoneDetailDrawerProps {
  isOpen: boolean;
  milestone: GanttMilestone | null;
  allMilestones: GanttMilestone[];
  goals: Array<{ id: string; title: string }>;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<GanttMilestone>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleTask?: (taskId: string, newStatus: string) => Promise<void>;
}

export function MilestoneDetailDrawer(props: MilestoneDetailDrawerProps) {
  if (!props.isOpen || !props.milestone) return null;
  return (
    <MilestoneDetailDrawerContent
      key={props.milestone.id}
      {...props}
      milestone={props.milestone}
    />
  );
}

function formatDateInput(val: Date | string | null | undefined): string {
  return formatPlainDateInput(val);
}

function MilestoneDetailDrawerContent({
  isOpen,
  milestone,
  allMilestones,
  goals,
  onClose,
  onUpdate,
  onDelete,
  onToggleTask,
}: MilestoneDetailDrawerProps & { milestone: GanttMilestone }) {
  const { confirm: confirmDialog } = useConfirm();
  const drawerRef = useRef<HTMLDialogElement>(null);

  const initialStart = formatDateInput(milestone.startDate);
  const initialTarget = formatDateInput(milestone.targetDate);
  const initialDeps = milestone.dependsOn || [];

  const [title, setTitle] = useState(milestone.title);
  const [description, setDescription] = useState(milestone.description || "");
  const [status, setStatus] = useState(milestone.status || "planned");
  const [goalId, setGoalId] = useState(milestone.goalId || "");
  const [startDate, setStartDate] = useState(initialStart);
  const [targetDate, setTargetDate] = useState(initialTarget);
  const [dependsOn, setDependsOn] = useState<string[]>(initialDeps);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [depError, setDepError] = useState("");
  const [selectedNewPred, setSelectedNewPred] = useState("");

  const isDirty = useMemo(() => {
    const depsChanged =
      dependsOn.length !== initialDeps.length ||
      dependsOn.some((id, idx) => id !== initialDeps[idx]);
    return (
      title !== milestone.title ||
      description !== (milestone.description || "") ||
      status !== (milestone.status || "planned") ||
      goalId !== (milestone.goalId || "") ||
      startDate !== initialStart ||
      targetDate !== initialTarget ||
      depsChanged
    );
  }, [
    title,
    description,
    status,
    goalId,
    startDate,
    targetDate,
    dependsOn,
    milestone.title,
    milestone.description,
    milestone.status,
    milestone.goalId,
    initialStart,
    initialTarget,
    initialDeps,
  ]);

  const handleAttemptClose = useCallback(async () => {
    if (saving || deleting) return;
    if (isDirty) {
      const discard = await confirmDialog({
        title: "Discard unsaved changes?",
        description: "You have unsaved edits to this milestone. Closing now will discard them.",
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        danger: true,
      });
      if (!discard) return;
    }
    onClose();
  }, [saving, deleting, isDirty, confirmDialog, onClose]);

  useModalA11y(drawerRef, handleAttemptClose, isOpen);

  const currentGoal = goals.find((g) => g.id === goalId);
  const variance = calculateBaselineVariance(
    targetDate ? new Date(targetDate) : milestone.targetDate,
    milestone.baselineTargetDate
  );

  // Filter candidates for predecessors (excluding self and existing deps)
  const candidatePredecessors = allMilestones.filter(
    (m) => m.id !== milestone.id && !dependsOn.includes(m.id)
  );

  // Successors (other milestones that depend on this one)
  const successors = allMilestones.filter((m) =>
    (m.dependsOn || []).includes(milestone.id)
  );

  function handleAddPredecessor() {
    if (!selectedNewPred) return;
    const check = canAddDependency(allMilestones, selectedNewPred, milestone.id);
    if (!check.allowed) {
      setDepError(check.reason || "Circular dependency detected.");
      return;
    }
    setDepError("");
    setDependsOn([...dependsOn, selectedNewPred]);
    setSelectedNewPred("");
  }

  function handleRemovePredecessor(predId: string) {
    setDependsOn(dependsOn.filter((id) => id !== predId));
  }

  async function handleSave() {
    if (!title.trim()) {
      setErrorMsg("Milestone title is required.");
      return;
    }
    if (startDate && targetDate && new Date(startDate) > new Date(targetDate)) {
      setErrorMsg("Start date cannot be after target date.");
      return;
    }
    setErrorMsg("");
    setSaving(true);
    try {
      await onUpdate(milestone.id, {
        title: title.trim(),
        description,
        status,
        goalId,
        startDate: startDate ? new Date(startDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null,
        dependsOn,
      });
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to save milestone changes. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const ok = await confirmDialog({
      title: `Delete "${milestone.title}"?`,
      description: "This milestone, its schedule, and its dependencies will be permanently removed.",
      confirmLabel: "Delete milestone",
      danger: true,
    });
    if (!ok) return;
    setErrorMsg("");
    setDeleting(true);
    try {
      await onDelete(milestone.id);
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to delete milestone. Please try again."
      );
    } finally {
      setDeleting(false);
    }
  }

  const STATUS_OPTIONS = [
    { value: "planned", label: "Planned" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "delayed", label: "Delayed" },
  ];

  return (
    <dialog
      ref={drawerRef}
      {...({ closedby: isDirty ? "none" : "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
      aria-labelledby="milestone-drawer-title"
      className="my-0 ml-auto mr-0 w-full max-w-lg bg-white h-dvh max-h-dvh shadow-2xl border-l border-border p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-xs"
    >
      <div className="h-full flex flex-col">
        {/* Drawer Header */}
        <div className="p-5 border-b border-border flex items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center shrink-0">
              <Layers size={16} className="text-blue" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="milestone-drawer-title" className="font-bold text-ink text-sm truncate">
                Milestone Details
              </h2>
              <div className="text-[11px] text-muted truncate">
                Goal: <span className="font-medium text-slate">{currentGoal?.title || "Standalone"}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleAttemptClose()}
            aria-label="Close drawer"
            className="p-1.5 text-muted hover:text-ink hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2"
            >
              <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label
              htmlFor="ms-drawer-title-input"
              className="text-xs font-semibold text-slate uppercase tracking-wider"
            >
              Title
            </label>
            <input
              id="ms-drawer-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              placeholder="e.g. Core Authentication Engine"
              className="w-full text-sm font-semibold text-ink px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
            />
          </div>

          {/* Status & Goal Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="ms-drawer-status"
                className="text-xs font-semibold text-slate uppercase tracking-wider"
              >
                Status
              </label>
              <select
                id="ms-drawer-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-xs font-medium text-ink px-3 py-2.5 bg-white border border-border rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="ms-drawer-goal"
                className="text-xs font-semibold text-slate uppercase tracking-wider"
              >
                Parent Goal
              </label>
              <select
                id="ms-drawer-goal"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="w-full text-xs font-medium text-ink px-3 py-2.5 bg-white border border-border rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date Ranges */}
          <div className="p-4 bg-slate-50 border border-border rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-ink flex items-center gap-1.5">
                <Calendar size={14} className="text-blue" aria-hidden="true" />
                Schedule & Baseline
              </div>
              {variance.status !== "no_baseline" && (
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    variance.status === "delayed"
                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                      : variance.status === "ahead"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-blue-faint text-blue border border-blue-light"
                  }`}
                >
                  {variance.label}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ms-drawer-start" className="text-[11px] text-muted block mb-1">
                  Start Date
                </label>
                <input
                  id="ms-drawer-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  className="w-full text-xs text-ink px-2.5 py-1.5 bg-white border border-border rounded-lg focus:outline-none focus:border-blue"
                />
              </div>
              <div>
                <label htmlFor="ms-drawer-target" className="text-[11px] text-muted block mb-1">
                  Target Date
                </label>
                <input
                  id="ms-drawer-target"
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    setTargetDate(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  className="w-full text-xs text-ink px-2.5 py-1.5 bg-white border border-border rounded-lg focus:outline-none focus:border-blue"
                />
              </div>
            </div>

            {milestone.baselineTargetDate && (
              <div className="text-[11px] text-muted pt-1 border-t border-border/60 flex items-center justify-between">
                <span>Baseline Target:</span>
                <span className="font-medium text-slate">
                  {new Date(milestone.baselineTargetDate).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              htmlFor="ms-drawer-description"
              className="text-xs font-semibold text-slate uppercase tracking-wider"
            >
              Description / Notes
            </label>
            <textarea
              id="ms-drawer-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add key deliverables, technical constraints, or acceptance criteria…"
              rows={3}
              className="w-full text-xs text-ink px-3 py-2.5 border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
            />
          </div>

          {/* Dependencies (Predecessors) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="ms-drawer-predecessor"
                className="text-xs font-semibold text-slate uppercase tracking-wider flex items-center gap-1.5"
              >
                <Link2 size={14} className="text-blue" aria-hidden="true" />
                Predecessors (Must Finish First)
              </label>
              <span className="text-[11px] text-muted">
                {dependsOn.length} linked
              </span>
            </div>

            {dependsOn.length > 0 ? (
              <div className="space-y-1.5">
                {dependsOn.map((predId) => {
                  const pred = allMilestones.find((m) => m.id === predId);
                  return (
                    <div
                      key={predId}
                      className="flex items-center justify-between bg-slate-50 border border-border px-3 py-2 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full bg-blue shrink-0" />
                        <span className="font-medium text-ink truncate">
                          {pred ? pred.title : predId}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePredecessor(predId)}
                        aria-label={`Remove predecessor ${pred ? pred.title : predId}`}
                        className="text-muted hover:text-danger p-0.5 rounded transition-colors cursor-pointer"
                        title="Remove dependency"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted italic bg-slate-50/50 p-3 rounded-xl border border-dashed border-border text-center">
                No predecessor dependencies configured.
              </div>
            )}

            {/* Add Predecessor Dropdown */}
            <div className="flex gap-2">
              <select
                id="ms-drawer-predecessor"
                value={selectedNewPred}
                onChange={(e) => setSelectedNewPred(e.target.value)}
                className="flex-1 text-xs text-ink px-3 py-2 bg-white border border-border rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
              >
                <option value="">+ Select predecessor milestone…</option>
                {candidatePredecessors.map((cand) => (
                  <option key={cand.id} value={cand.id}>
                    {cand.title} ({cand.goalTitle || "Goal"})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddPredecessor}
                disabled={!selectedNewPred}
                className="bg-blue text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
              >
                <Plus size={14} aria-hidden="true" /> Add
              </button>
            </div>

            {depError && (
              <p role="alert" className="text-xs text-danger flex items-center gap-1">
                <AlertCircle size={12} aria-hidden="true" /> {depError}
              </p>
            )}
          </div>

          {/* Successors info (Downstream dependent milestones) */}
          {successors.length > 0 && (
            <div className="p-3 bg-blue-faint/60 border border-blue-light/80 rounded-xl space-y-1.5 text-xs">
              <div className="font-semibold text-blue flex items-center gap-1">
                <ArrowRight size={13} aria-hidden="true" />
                Blocks {successors.length} Downstream Milestone{successors.length > 1 ? "s" : ""}:
              </div>
              <ul className="list-disc list-inside text-slate space-y-0.5 pl-1 text-[11px]">
                {successors.map((s) => (
                  <li key={s.id} className="truncate">
                    {s.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Linked Tasks List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />
                Linked Tasks
              </span>
              <span className="text-[11px] text-muted">
                {milestone.tasks?.length || 0} tasks
              </span>
            </div>

            {milestone.tasks && milestone.tasks.length > 0 ? (
              <div className="space-y-1.5">
                {milestone.tasks.map((task) => {
                  const isDone = task.status === "done";
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-2 bg-white border border-border rounded-xl text-xs"
                    >
                      <label className="group flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isDone}
                          onChange={() =>
                            void onToggleTask?.(task.id, isDone ? "todo" : "done")
                          }
                          className="rounded border-border text-blue focus:ring-blue/30 cursor-pointer"
                        />
                        <SingleLineOverflow
                          text={task.title}
                          focusableWhenTruncated
                          className={
                            isDone ? "line-through text-muted" : "text-ink font-medium"
                          }
                        />
                      </label>
                      {(() => {
                        const dateObj = task.dueDate ? new Date(task.dueDate) : null;
                        const isOverdue =
                          dateObj &&
                          !isDone &&
                          dateObj < new Date(new Date().setHours(0, 0, 0, 0));
                        return dateObj ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border shrink-0 ${
                              isOverdue
                                ? "bg-red-50 text-danger border-red-200 font-semibold"
                                : "bg-slate-50 text-slate-600 border-slate-200"
                            }`}
                          >
                            <Calendar
                              size={9}
                              className={isOverdue ? "text-danger" : "text-muted"}
                              aria-hidden="true"
                            />
                            {dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-muted italic bg-slate-50/50 p-3 rounded-xl border border-dashed border-border text-center">
                No tasks assigned directly to this milestone yet.
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-border bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || saving}
            className="flex items-center gap-1.5 text-xs text-danger hover:bg-rose-50 px-3 py-2 rounded-xl transition-colors font-semibold cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={14} aria-hidden="true" />
            {deleting ? "Deleting…" : "Delete"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAttemptClose()}
              disabled={saving || deleting}
              className="px-4 py-2 text-xs font-semibold text-slate hover:text-ink hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || deleting || !title.trim()}
              className="bg-blue text-white px-5 py-2 rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
