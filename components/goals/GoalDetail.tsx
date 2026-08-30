"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Zap, FileText, MessageCircle, ChevronRight, CheckCircle2, Circle, Clock, AlertTriangle, Plus, X } from "lucide-react";
import Link from "next/link";
import { MentionInput, renderMentionedBody } from "@/components/ui/MentionInput";
import { useConfirm } from "@/context/ConfirmContext";

const GoalHealthScore = dynamic(
  () => import("@/components/dashboard/GoalHealthScore").then((m) => ({ default: m.GoalHealthScore })),
  { ssr: false }
);

interface KeyResult { id: string; title: string; target: number; current: number; unit: string }

interface DeconstructMilestone {
  name: string;
  goal: string;
  durationWeeks: number;
  tasks: { title: string; priority: string; storyPoints: number; suggestedOwnerRole: string }[];
}

interface DeconstructResult {
  recommendation?: string;
  suggestedTimeline?: string;
  milestones?: DeconstructMilestone[];
  risks?: string[];
}

interface GoalDetailProps {
  goal: {
    id: string;
    title: string;
    objective: string;
    status: string;
    healthScore: number;
    targetDate: Date | null;
    keyResults: unknown;
    milestones: {
      id: string; title: string; description: string | null; status: string; targetDate: Date | null;
      tasks: { id: string; title: string; status: string; priority: string; storyPoints: number | null; assigneeId: string | null }[];
    }[];
    documents: { id: string; title: string; author: { name: string | null } | null; updatedAt: Date }[];
    comments: { id: string; body: string; author: { id: string; name: string | null; image: string | null }; createdAt: Date }[];
  };
  workspaceId: string;
  userId: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 size={14} className="text-success" />,
  completed: <CheckCircle2 size={14} className="text-success" />,
  in_progress: <Clock size={14} className="text-blue" />,
  blocked: <AlertTriangle size={14} className="text-danger" />,
  todo: <Circle size={14} className="text-muted" />,
  planned: <Circle size={14} className="text-muted" />,
};

export function GoalDetail({ goal, workspaceId, userId }: GoalDetailProps) {
  const { confirm: confirmDialog } = useConfirm();
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState(goal.comments);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [deconstructResult, setDeconstructResult] = useState<DeconstructResult | null>(null);
  const [deconstructLoading, setDeconstructLoading] = useState(false);

  // Goal inline editing
  const [goalTitle, setGoalTitle] = useState(goal.title);
  const [goalObjective, setGoalObjective] = useState(goal.objective);
  const [editingGoalField, setEditingGoalField] = useState<"title" | "objective" | null>(null);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSaveError, setGoalSaveError] = useState("");

  async function saveGoalField(field: "title" | "objective", value: string) {
    if (!value.trim()) return;
    setGoalSaving(true);
    setGoalSaveError("");
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value.trim() }),
      });
      if (res.ok) {
        if (field === "title") setGoalTitle(value.trim());
        else setGoalObjective(value.trim());
        setEditingGoalField(null);
      } else {
        const data = await res.json();
        setGoalSaveError(data.error ?? "Failed to save. Please try again.");
      }
    } catch {
      setGoalSaveError("Network error. Please try again.");
    } finally {
      setGoalSaving(false);
    }
  }

  // Milestone inline editing
  const [editingMsId, setEditingMsId] = useState<string | null>(null);
  const [editingMsField, setEditingMsField] = useState<"title" | "description" | null>(null);
  const [editingMsValue, setEditingMsValue] = useState("");
  const [msSaving, setMsSaving] = useState(false);
  const [msSaveError, setMsSaveError] = useState("");

  async function saveMilestoneField(msId: string, field: "title" | "description") {
    if (field === "title" && !editingMsValue.trim()) return;
    setMsSaving(true);
    setMsSaveError("");
    try {
      const res = await fetch(`/api/milestones/${msId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: editingMsValue.trim() || null }),
      });
      if (res.ok) {
        setMilestones((prev) =>
          prev.map((m) => m.id === msId ? { ...m, [field]: editingMsValue.trim() || null } : m)
        );
        setEditingMsId(null);
        setEditingMsField(null);
      } else {
        const data = await res.json();
        setMsSaveError(data.error ?? "Failed to save. Please try again.");
      }
    } catch {
      setMsSaveError("Network error. Please try again.");
    } finally {
      setMsSaving(false);
    }
  }

  function startMsEdit(msId: string, field: "title" | "description", current: string | null) {
    setEditingMsId(msId);
    setEditingMsField(field);
    setEditingMsValue(current ?? "");
  }

  // Milestone creation state
  const [milestones, setMilestones] = useState(goal.milestones);
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msDescription, setMsDescription] = useState("");
  const [msTargetDate, setMsTargetDate] = useState("");
  const [msStatus, setMsStatus] = useState("planned");
  const [msSubmitting, setMsSubmitting] = useState(false);
  const [msError, setMsError] = useState("");

  const health = goal.healthScore;

  const keyResults = (goal.keyResults as KeyResult[]) ?? [];

  async function postComment() {
    if (!comment.trim()) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment, entityType: "goal", goalId: goal.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setComment("");
    }
  }

  async function deconstructGoal() {
    setDeconstructLoading(true);
    const objectiveText = goal.objective?.trim() || goal.title;
    const res = await fetch("/api/ai/goal-deconstructor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, objective: objectiveText }),
    });
    const data = await res.json();
    if (res.ok) setDeconstructResult(data as DeconstructResult);
    setDeconstructLoading(false);
  }

  async function createMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!msTitle.trim()) {
      setMsError("Milestone title is required.");
      return;
    }
    setMsSubmitting(true);
    setMsError("");
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          goalId: goal.id,
          title: msTitle.trim(),
          description: msDescription.trim() || undefined,
          targetDate: msTargetDate ? new Date(msTargetDate).toISOString() : null,
          status: msStatus,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsError(data.error ?? "Failed to create milestone.");
        return;
      }
      const data = await res.json();
      const newMs = {
        ...data.milestone,
        tasks: data.milestone.tasks ?? [],
      };
      setMilestones((prev) => [...prev, newMs]);
      setMsTitle("");
      setMsDescription("");
      setMsTargetDate("");
      setMsStatus("planned");
      setShowAddMilestone(false);
    } catch {
      setMsError("An unexpected error occurred.");
    } finally {
      setMsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${
                goal.status === "active" ? "bg-blue-faint text-blue" :
                goal.status === "completed" ? "bg-green-100 text-success" : "bg-border text-muted"
              }`}>{goal.status}</span>
              {goal.targetDate && (
                <span className="text-xs text-muted">Due {new Date(goal.targetDate).toLocaleDateString()}</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-ink">
              {editingGoalField === "title" ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={goalTitle}
                      onChange={(e) => { setGoalTitle(e.target.value); setGoalSaveError(""); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && goalTitle.length <= 200) saveGoalField("title", goalTitle);
                        if (e.key === "Escape") { setGoalTitle(goal.title); setEditingGoalField(null); setGoalSaveError(""); }
                      }}
                      className="flex-1 text-xl font-bold text-ink border-b-2 border-blue bg-transparent focus:outline-none"
                    />
                    <button onClick={() => saveGoalField("title", goalTitle)} disabled={goalSaving || goalTitle.length > 200} className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50">
                      {goalSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => { setGoalTitle(goal.title); setEditingGoalField(null); setGoalSaveError(""); }} className="text-xs text-muted hover:text-ink">Cancel</button>
                  </div>
                  <div className="flex items-center justify-between">
                    {goalSaveError
                      ? <p className="text-xs text-danger font-medium">{goalSaveError}</p>
                      : goalTitle.length > 200
                        ? <p className="text-xs text-danger font-medium">Title is too long (max 200 characters)</p>
                        : <span />
                    }
                    <span className={`text-[11px] tabular-nums ${goalTitle.length > 200 ? "text-danger font-semibold" : goalTitle.length > 180 ? "text-warning" : "text-muted"}`}>
                      {goalTitle.length}/200
                    </span>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingGoalField("title")}
                  className="text-left hover:text-blue transition-colors group w-full"
                  title="Click to edit title"
                >
                  {goalTitle}
                  <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted font-normal">✎</span>
                </button>
              )}
            </h1>
            <div className="text-slate text-sm mt-2">
              {editingGoalField === "objective" ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={goalObjective}
                    onChange={(e) => { setGoalObjective(e.target.value); setGoalSaveError(""); }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") { setGoalObjective(goal.objective); setEditingGoalField(null); setGoalSaveError(""); }
                    }}
                    rows={3}
                    className="w-full text-sm text-slate border border-blue/40 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue/20 bg-white resize-none"
                  />
                  <div className="flex items-center justify-between">
                    {goalSaveError
                      ? <p className="text-xs text-danger font-medium">{goalSaveError}</p>
                      : goalObjective.length > 2000
                        ? <p className="text-xs text-danger font-medium">Objective is too long (max 2000 characters)</p>
                        : <span />
                    }
                    <span className={`text-[11px] tabular-nums ${goalObjective.length > 2000 ? "text-danger font-semibold" : goalObjective.length > 1800 ? "text-warning" : "text-muted"}`}>
                      {goalObjective.length}/2000
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveGoalField("objective", goalObjective)} disabled={goalSaving || goalObjective.length > 2000} className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50">
                      {goalSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => { setGoalObjective(goal.objective); setEditingGoalField(null); setGoalSaveError(""); }} className="text-xs text-muted hover:text-ink">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingGoalField("objective")}
                  className="text-left hover:text-ink transition-colors group w-full"
                  title="Click to edit objective"
                >
                  {goalObjective}
                  <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted">✎</span>
                </button>
              )}
            </div>
          </div>
          <div className="sm:shrink-0">
            <GoalHealthScore score={health} size="md" />
          </div>
        </div>

        {/* Key Results */}
        {keyResults.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Key Results</h3>
            <div className="space-y-3">
              {keyResults.map((kr) => {
                const pct = Math.min(100, Math.round((kr.current / kr.target) * 100));
                return (
                  <div key={kr.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-ink">{kr.title}</span>
                      <span className="text-sm font-semibold text-ink">{kr.current} / {kr.target} {kr.unit}</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-blue rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI deconstruct */}
        <div className="mt-5 pt-5 border-t border-border">
          <button
            onClick={deconstructGoal}
            disabled={deconstructLoading}
            className="flex items-center gap-2 text-sm text-blue hover:text-blue-mid font-medium transition-colors"
          >
            <Zap size={14} />
            {deconstructLoading ? "Analysing…" : "Deconstruct with AI →"}
          </button>
          {deconstructResult && (
            <div className="mt-4 space-y-3">
              {deconstructResult.recommendation && (
                <div className="bg-blue-faint border border-blue-light rounded-xl p-4 text-sm text-slate">
                  <span className="font-semibold text-ink block mb-1">AI Recommendation</span>
                  {deconstructResult.recommendation}
                </div>
              )}
              {deconstructResult.milestones && deconstructResult.milestones.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-ink uppercase tracking-wide">Suggested Milestones</span>
                  <div className="mt-2 space-y-2">
                    {deconstructResult.milestones.map((ms, i) => (
                      <div key={i} className="bg-white border border-border rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-ink">{ms.name}</span>
                          <span className="text-xs text-muted">{ms.durationWeeks}w</span>
                        </div>
                        <p className="text-xs text-slate mb-2">{ms.goal}</p>
                        <div className="flex flex-wrap gap-1">
                          {ms.tasks.slice(0, 4).map((t, ti) => (
                            <span key={ti} className="text-[10px] px-2 py-0.5 bg-offwhite border border-border rounded-full text-slate">{t.title}</span>
                          ))}
                          {ms.tasks.length > 4 && <span className="text-[10px] text-muted">+{ms.tasks.length - 4} more</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {deconstructResult.risks && deconstructResult.risks.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <span className="text-xs font-semibold text-amber-800 block mb-1">Risks to watch</span>
                  <ul className="text-xs text-amber-700 space-y-0.5 list-disc pl-4">
                    {deconstructResult.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              <button onClick={() => setDeconstructResult(null)} className="text-xs text-muted hover:text-ink transition-colors">
                Dismiss
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Milestones ({milestones.length})</h2>
          <button
            onClick={() => setShowAddMilestone(true)}
            className="text-sm text-blue hover:underline flex items-center gap-1 font-medium transition-colors"
          >
            <Plus size={14} /> Add Milestone
          </button>
        </div>

        {/* Inline Create Form */}
        {showAddMilestone && (
          <form onSubmit={createMilestone} className="mb-4 bg-offwhite border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">New Milestone</h3>
              <button
                type="button"
                onClick={() => { setShowAddMilestone(false); setMsError(""); }}
                className="text-muted hover:text-ink p-1 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            {msError && (
              <p className="text-xs text-danger font-medium bg-red-50 border border-red-200 rounded-lg p-2">{msError}</p>
            )}
            <div>
              <input
                type="text"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="Milestone title (e.g. Core Architecture Setup)"
                className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
                autoFocus
              />
            </div>
            <div>
              <textarea
                value={msDescription}
                onChange={(e) => setMsDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate mb-1">Target Date</label>
                <input
                  type="date"
                  value={msTargetDate}
                  onChange={(e) => setMsTargetDate(e.target.value)}
                  className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate mb-1">Status</label>
                <select
                  value={msStatus}
                  onChange={(e) => setMsStatus(e.target.value)}
                  className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowAddMilestone(false); setMsError(""); }}
                className="px-3 py-1.5 text-xs text-slate hover:text-ink font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={msSubmitting}
                className="bg-blue text-white px-4 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-mid disabled:opacity-50 transition-colors"
              >
                {msSubmitting ? "Creating…" : "Create Milestone"}
              </button>
            </div>
          </form>
        )}

        {/* Milestones list */}
        {milestones.length === 0 ? (
          <p className="text-sm text-muted">No milestones created for this goal yet.</p>
        ) : (
          <div className="space-y-3">
            {milestones.map((ms) => (
              <div key={ms.id} className="border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  {STATUS_ICON[ms.status]}
                  {editingMsId === ms.id && editingMsField === "title" ? (
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editingMsValue}
                          onChange={(e) => { setEditingMsValue(e.target.value); setMsSaveError(""); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingMsValue.length <= 300) saveMilestoneField(ms.id, "title");
                            if (e.key === "Escape") { setEditingMsId(null); setEditingMsField(null); setMsSaveError(""); }
                          }}
                          className="flex-1 text-sm font-medium text-ink border-b border-blue bg-transparent focus:outline-none"
                        />
                        <button onClick={() => saveMilestoneField(ms.id, "title")} disabled={msSaving || editingMsValue.length > 300} className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50 shrink-0">{msSaving ? "…" : "Save"}</button>
                        <button onClick={() => { setEditingMsId(null); setEditingMsField(null); setMsSaveError(""); }} className="text-xs text-muted hover:text-ink shrink-0">✕</button>
                      </div>
                      <div className="flex items-center justify-between">
                        {msSaveError
                          ? <p className="text-xs text-danger font-medium">{msSaveError}</p>
                          : editingMsValue.length > 300
                            ? <p className="text-xs text-danger font-medium">Too long (max 300 characters)</p>
                            : <span />
                        }
                        <span className={`text-[11px] tabular-nums ${editingMsValue.length > 300 ? "text-danger font-semibold" : editingMsValue.length > 270 ? "text-warning" : "text-muted"}`}>
                          {editingMsValue.length}/300
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startMsEdit(ms.id, "title", ms.title)}
                      className="font-medium text-ink text-sm text-left hover:text-blue transition-colors group flex-1"
                      title="Click to edit"
                    >
                      {ms.title}
                      <span className="ml-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-muted font-normal">✎</span>
                    </button>
                  )}
                  {ms.targetDate && !(editingMsId === ms.id && editingMsField === "title") && (
                    <span className="text-xs text-muted ml-auto shrink-0">
                      {new Date(ms.targetDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Description — editable */}
                {editingMsId === ms.id && editingMsField === "description" ? (
                  <div className="mb-2 space-y-1.5">
                    <textarea
                      autoFocus
                      value={editingMsValue}
                      onChange={(e) => { setEditingMsValue(e.target.value); setMsSaveError(""); }}
                      onKeyDown={(e) => { if (e.key === "Escape") { setEditingMsId(null); setEditingMsField(null); setMsSaveError(""); } }}
                      rows={2}
                      placeholder="Add a description…"
                      className="w-full text-xs text-slate border border-blue/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue/20 bg-white resize-none"
                    />
                    <div className="flex items-center justify-between">
                      {msSaveError
                        ? <p className="text-xs text-danger font-medium">{msSaveError}</p>
                        : editingMsValue.length > 1000
                          ? <p className="text-xs text-danger font-medium">Too long (max 1000 characters)</p>
                          : <span />
                      }
                      <span className={`text-[11px] tabular-nums ${editingMsValue.length > 1000 ? "text-danger font-semibold" : editingMsValue.length > 900 ? "text-warning" : "text-muted"}`}>
                        {editingMsValue.length}/1000
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveMilestoneField(ms.id, "description")} disabled={msSaving || editingMsValue.length > 1000} className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50">{msSaving ? "Saving…" : "Save"}</button>
                      <button onClick={() => { setEditingMsId(null); setEditingMsField(null); setMsSaveError(""); }} className="text-xs text-muted hover:text-ink">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startMsEdit(ms.id, "description", ms.description)}
                    className="block text-left w-full mb-2 group"
                    title="Click to edit description"
                  >
                    {ms.description
                      ? <span className="text-xs text-slate group-hover:text-ink transition-colors">{ms.description} <span className="opacity-0 group-hover:opacity-100 transition-opacity text-muted">✎</span></span>
                      : <span className="text-xs text-muted opacity-0 group-hover:opacity-60 transition-opacity">+ Add description</span>
                    }
                  </button>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {(ms.tasks ?? []).slice(0, 5).map((t) => (
                    <span key={t.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      t.status === "done" ? "bg-green-50 border-green-200 text-success" :
                      t.status === "blocked" ? "bg-red-50 border-red-200 text-danger" :
                      "bg-offwhite border-border text-slate"
                    }`}>{t.title.slice(0, 30)}</span>
                  ))}
                  {(ms.tasks ?? []).length > 5 && <span className="text-[10px] text-muted">+{(ms.tasks ?? []).length - 5} more</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Connected Docs ({goal.documents.length})</h2>
          <Link href={`/workspace/${workspaceId}/docs/new?linkedGoalId=${goal.id}`} className="text-sm text-blue hover:underline flex items-center gap-1">
            <FileText size={13} /> Add doc
          </Link>
        </div>
        {goal.documents.length === 0 ? (
          <p className="text-sm text-muted">No docs linked yet.</p>
        ) : (
          <div className="space-y-2">
            {goal.documents.map((doc) => (
              <Link key={doc.id} href={`/workspace/${workspaceId}/docs/${doc.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-offwhite transition-colors">
                <FileText size={14} className="text-blue shrink-0" />
                <span className="text-sm text-ink flex-1">{doc.title}</span>
                <span className="text-xs text-muted">{doc.author?.name}</span>
                <ChevronRight size={14} className="text-muted" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-ink mb-4">
          <span className="flex items-center gap-2"><MessageCircle size={16} /> Comments ({comments.length})</span>
        </h2>
        <div className="space-y-3 mb-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-light flex items-center justify-center text-blue text-xs font-bold uppercase shrink-0">
                {c.author.name?.[0] ?? "?"}
              </div>
              <div className="flex-1 bg-offwhite rounded-xl px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-xs font-medium text-ink">{c.author.name}</span>
                  {c.author.id === userId && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditingCommentId(c.id); setEditingBody(c.body); }}
                        className="text-[11px] text-muted hover:text-blue transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: "Delete this comment?",
                            description: "This cannot be undone.",
                            confirmLabel: "Delete",
                            danger: true,
                          });
                          if (!ok) return;
                          const res = await fetch(`/api/comments/${c.id}`, { method: "DELETE" });
                          if (res.ok) setComments((prev) => prev.filter((x) => x.id !== c.id));
                        }}
                        className="text-[11px] text-muted hover:text-danger transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {editingCommentId === c.id ? (
                  <div className="mt-1 flex gap-2 items-center">
                    <MentionInput
                      value={editingBody}
                      onChange={setEditingBody}
                      workspaceId={workspaceId}
                      autoFocus
                      onSubmit={async () => {
                        const res = await fetch(`/api/comments/${c.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ body: editingBody }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setComments((prev) => prev.map((x) => x.id === c.id ? data.comment : x));
                          setEditingCommentId(null);
                        }
                      }}
                      className="w-full border border-blue/40 rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue/20 bg-white"
                    />
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/comments/${c.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ body: editingBody }),
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setComments((prev) => prev.map((x) => x.id === c.id ? data.comment : x));
                          setEditingCommentId(null);
                        }
                      }}
                      className="text-xs text-blue font-semibold hover:text-blue-mid px-2.5 py-1.5 bg-blue-faint rounded-lg border border-blue-light shrink-0"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingCommentId(null)} className="text-xs text-muted hover:text-ink shrink-0">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate mt-0.5 whitespace-pre-wrap">{renderMentionedBody(c.body)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <MentionInput
            value={comment}
            onChange={setComment}
            onSubmit={postComment}
            workspaceId={workspaceId}
            placeholder="Add a comment… (Type @ to mention someone)"
          />
          <button
            onClick={postComment}
            disabled={!comment.trim()}
            className="bg-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
