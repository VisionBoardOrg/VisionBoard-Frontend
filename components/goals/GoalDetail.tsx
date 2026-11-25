"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  FileText,
  MessageCircle,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Plus,
  X,
  ArrowLeft,
  Trash2,
  Calendar,
  Map as MapIcon,
  LayoutGrid,
  Loader2,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import { MentionInput, renderMentionedBody } from "@/components/ui/MentionInput";
import { useConfirm } from "@/context/ConfirmContext";
import { useToast } from "@/context/ToastContext";
import { GoalHealthScore } from "@/components/dashboard/GoalHealthScore";

interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
}

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
    targetDate: Date | string | null;
    keyResults: unknown;
    milestones: {
      id: string;
      title: string;
      description: string | null;
      status: string;
      targetDate: Date | string | null;
      tasks: {
        id: string;
        title: string;
        status: string;
        priority: string;
        storyPoints: number | null;
        assignees?: { userId: string; role: string }[];
      }[];
    }[];
    documents: {
      id: string;
      title: string;
      author: { name: string | null } | null;
      updatedAt: Date | string;
    }[];
    comments: {
      id: string;
      body: string;
      author: { id: string; name: string | null; image: string | null };
      createdAt: Date | string;
    }[];
  };
  workspaceId: string;
  userId: string;
  canEdit?: boolean;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 size={14} className="text-success" aria-hidden="true" />,
  completed: <CheckCircle2 size={14} className="text-success" aria-hidden="true" />,
  in_progress: <Clock size={14} className="text-blue" aria-hidden="true" />,
  blocked: <AlertTriangle size={14} className="text-danger" aria-hidden="true" />,
  delayed: <AlertTriangle size={14} className="text-danger" aria-hidden="true" />,
  todo: <Circle size={14} className="text-muted" aria-hidden="true" />,
  planned: <Circle size={14} className="text-muted" aria-hidden="true" />,
};

const VALID_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);

function formatDateInput(val: Date | string | null | undefined): string {
  if (!val) return "";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

export function GoalDetail({ goal, workspaceId, userId, canEdit = true }: GoalDetailProps) {
  const router = useRouter();
  const { confirm: confirmDialog } = useConfirm();
  const { toast } = useToast();

  // Comments state
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState(goal.comments);
  const [postingComment, setPostingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState("");

  // AI Deconstructor state
  const [deconstructResult, setDeconstructResult] = useState<DeconstructResult | null>(null);
  const [deconstructLoading, setDeconstructLoading] = useState(false);
  const [deconstructError, setDeconstructError] = useState<{ message: string; isUpgrade?: boolean } | null>(null);
  const [committingDeconstruct, setCommittingDeconstruct] = useState(false);

  // Goal metadata & inline editing (with saved baseline to prevent stale Escape revert!)
  const [savedTitle, setSavedTitle] = useState(goal.title);
  const [savedObjective, setSavedObjective] = useState(goal.objective);
  const [goalTitle, setGoalTitle] = useState(goal.title);
  const [goalObjective, setGoalObjective] = useState(goal.objective);
  const [goalStatus, setGoalStatus] = useState(goal.status);
  const [goalTargetDate, setGoalTargetDate] = useState(formatDateInput(goal.targetDate));
  const [editingGoalField, setEditingGoalField] = useState<"title" | "objective" | null>(null);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalSaveError, setGoalSaveError] = useState("");
  const [deletingGoal, setDeletingGoal] = useState(false);

  // Key Results CRUD state
  const [keyResults, setKeyResults] = useState<KeyResult[]>(() =>
    Array.isArray(goal.keyResults) ? (goal.keyResults as KeyResult[]) : []
  );
  const [showAddKr, setShowAddKr] = useState(false);
  const [newKrTitle, setNewKrTitle] = useState("");
  const [newKrTarget, setNewKrTarget] = useState("100");
  const [newKrCurrent, setNewKrCurrent] = useState("0");
  const [newKrUnit, setNewKrUnit] = useState("%");
  const [editingKrId, setEditingKrId] = useState<string | null>(null);
  const [editKrCurrent, setEditKrCurrent] = useState("");
  const [editKrTarget, setEditKrTarget] = useState("");
  const [krSaving, setKrSaving] = useState(false);
  const [krError, setKrError] = useState("");

  async function saveGoalField(field: "title" | "objective", value: string) {
    if (!canEdit || !value.trim()) return;
    setGoalSaving(true);
    setGoalSaveError("");
    try {
      const trimmed = value.trim();
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: trimmed }),
      });
      if (res.ok) {
        if (field === "title") {
          setGoalTitle(trimmed);
          setSavedTitle(trimmed);
        } else {
          setGoalObjective(trimmed);
          setSavedObjective(trimmed);
        }
        setEditingGoalField(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setGoalSaveError(data.error ?? "Failed to save. Please try again.");
      }
    } catch {
      setGoalSaveError("Network error. Please try again.");
    } finally {
      setGoalSaving(false);
    }
  }

  async function handleStatusChange(nextStatus: string) {
    if (!canEdit || nextStatus === goalStatus) return;
    const prev = goalStatus;
    setGoalStatus(nextStatus);
    setGoalSaveError("");
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGoalStatus(prev);
        setGoalSaveError(data.error ?? "Failed to update goal status.");
      }
    } catch {
      setGoalStatus(prev);
      setGoalSaveError("Network error while updating goal status.");
    }
  }

  async function handleTargetDateChange(nextDate: string) {
    if (!canEdit || nextDate === goalTargetDate) return;
    const prev = goalTargetDate;
    setGoalTargetDate(nextDate);
    setGoalSaveError("");
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: nextDate ? new Date(nextDate).toISOString() : null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGoalTargetDate(prev);
        setGoalSaveError(data.error ?? "Failed to update target date.");
      }
    } catch {
      setGoalTargetDate(prev);
      setGoalSaveError("Network error while updating target date.");
    }
  }

  async function handleDeleteGoal() {
    if (!canEdit || deletingGoal) return;
    const ok = await confirmDialog({
      title: `Delete "${savedTitle}"?`,
      description:
        "This goal and its linked milestones will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete goal",
      danger: true,
    });
    if (!ok) return;
    setDeletingGoal(true);
    setGoalSaveError("");
    try {
      const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGoalSaveError(data.error ?? "Failed to delete goal.");
        return;
      }
      toast({ title: "Goal deleted", type: "success" });
      router.push(`/workspace/${workspaceId}/goals`);
      router.refresh();
    } catch {
      setGoalSaveError("Network error while deleting goal.");
    } finally {
      setDeletingGoal(false);
    }
  }

  // Persist Key Results array
  async function persistKeyResults(nextKrs: KeyResult[]): Promise<boolean> {
    setKrSaving(true);
    setKrError("");
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyResults: nextKrs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setKrError(data.error ?? "Failed to save Key Results.");
        return false;
      }
      setKeyResults(nextKrs);
      return true;
    } catch {
      setKrError("Network error while saving Key Results.");
      return false;
    } finally {
      setKrSaving(false);
    }
  }

  async function handleAddKeyResult(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const titleTrim = newKrTitle.trim();
    const targetNum = Number(newKrTarget);
    const currentNum = Number(newKrCurrent);
    if (!titleTrim) {
      setKrError("Key Result title is required.");
      return;
    }
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      setKrError("Target must be a number greater than 0.");
      return;
    }
    if (!Number.isFinite(currentNum) || currentNum < 0) {
      setKrError("Current value must be 0 or greater.");
      return;
    }
    const next: KeyResult[] = [
      ...keyResults,
      {
        id: `kr-${Date.now()}`,
        title: titleTrim,
        target: targetNum,
        current: currentNum,
        unit: newKrUnit.trim() || "%",
      },
    ];
    const ok = await persistKeyResults(next);
    if (ok) {
      setNewKrTitle("");
      setNewKrTarget("100");
      setNewKrCurrent("0");
      setNewKrUnit("%");
      setShowAddKr(false);
    }
  }

  async function handleSaveKrProgress(krId: string) {
    if (!canEdit) return;
    const currentNum = Number(editKrCurrent);
    const targetNum = Number(editKrTarget);
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      setKrError("Target must be greater than 0.");
      return;
    }
    if (!Number.isFinite(currentNum) || currentNum < 0) {
      setKrError("Current value must be 0 or greater.");
      return;
    }
    const next = keyResults.map((kr) =>
      kr.id === krId ? { ...kr, current: currentNum, target: targetNum } : kr
    );
    const ok = await persistKeyResults(next);
    if (ok) {
      setEditingKrId(null);
    }
  }

  async function handleDeleteKr(kr: KeyResult) {
    if (!canEdit) return;
    const ok = await confirmDialog({
      title: `Remove Key Result?`,
      description: `"${kr.title}" will be removed from this goal.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await persistKeyResults(keyResults.filter((x) => x.id !== kr.id));
  }

  // Milestone inline editing
  const [editingMsId, setEditingMsId] = useState<string | null>(null);
  const [editingMsField, setEditingMsField] = useState<"title" | "description" | null>(null);
  const [editingMsValue, setEditingMsValue] = useState("");
  const [msSaving, setMsSaving] = useState(false);
  const [msSaveError, setMsSaveError] = useState("");

  async function saveMilestoneField(msId: string, field: "title" | "description") {
    if (!canEdit) return;
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
          prev.map((m) => (m.id === msId ? { ...m, [field]: editingMsValue.trim() || null } : m))
        );
        setEditingMsId(null);
        setEditingMsField(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setMsSaveError(data.error ?? "Failed to save. Please try again.");
      }
    } catch {
      setMsSaveError("Network error. Please try again.");
    } finally {
      setMsSaving(false);
    }
  }

  function startMsEdit(msId: string, field: "title" | "description", current: string | null) {
    if (!canEdit) return;
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

  async function postComment() {
    if (!comment.trim() || postingComment) return;
    setPostingComment(true);
    setCommentError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim(), entityType: "goal", goalId: goal.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setComments((prev) => [...prev, data.comment]);
        setComment("");
      } else {
        setCommentError(data.error ?? "Failed to post comment.");
      }
    } catch {
      setCommentError("Network error while posting comment.");
    } finally {
      setPostingComment(false);
    }
  }

  async function saveCommentEdit(commentId: string) {
    if (!editingBody.trim() || savingCommentId) return;
    setSavingCommentId(commentId);
    setCommentError("");
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editingBody.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setComments((prev) => prev.map((x) => (x.id === commentId ? data.comment : x)));
        setEditingCommentId(null);
      } else {
        setCommentError(data.error ?? "Failed to update comment.");
      }
    } catch {
      setCommentError("Network error while updating comment.");
    } finally {
      setSavingCommentId(null);
    }
  }

  async function deleteComment(commentId: string) {
    if (deletingCommentId) return;
    const ok = await confirmDialog({
      title: "Delete this comment?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setDeletingCommentId(commentId);
    setCommentError("");
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      if (res.ok) {
        setComments((prev) => prev.filter((x) => x.id !== commentId));
      } else {
        const data = await res.json().catch(() => ({}));
        setCommentError(data.error ?? "Failed to delete comment.");
      }
    } catch {
      setCommentError("Network error while deleting comment.");
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function deconstructGoal() {
    if (deconstructLoading) return;
    setDeconstructLoading(true);
    setDeconstructError(null);
    try {
      const objectiveText = savedObjective?.trim() || savedTitle;
      const res = await fetch("/api/ai/goal-deconstructor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, objective: objectiveText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeconstructError({
          message:
            data.error ??
            (res.status === 403
              ? "AI credit limit reached or feature requires a plan upgrade."
              : res.status === 429
              ? "Too many AI requests right now. Please wait a moment and try again."
              : "Failed to deconstruct goal. Please try again."),
          isUpgrade: res.status === 403,
        });
        return;
      }
      setDeconstructResult(data as DeconstructResult);
    } catch {
      setDeconstructError({
        message: "Network error while contacting AI Goal Deconstructor.",
      });
    } finally {
      setDeconstructLoading(false);
    }
  }

  async function commitDeconstructedPlan() {
    if (!deconstructResult?.milestones?.length || committingDeconstruct || !canEdit) return;
    setCommittingDeconstruct(true);
    setDeconstructError(null);
    try {
      const createdMilestones: GoalDetailProps["goal"]["milestones"] = [];
      let cursorDate = new Date();

      for (const ms of deconstructResult.milestones) {
        const startDate = new Date(cursorDate);
        const durationDays = Math.max(7, Math.round((ms.durationWeeks || 2) * 7));
        const targetDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
        cursorDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

        const msRes = await fetch("/api/milestones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            goalId: goal.id,
            title: ms.name,
            description: ms.goal,
            startDate: startDate.toISOString(),
            targetDate: targetDate.toISOString(),
            status: "planned",
          }),
        });
        if (!msRes.ok) {
          const errData = await msRes.json().catch(() => ({}));
          throw new Error(errData.error ?? `Failed to create milestone "${ms.name}".`);
        }
        const msData = await msRes.json();
        const createdMs = msData.milestone;

        const createdTasks: GoalDetailProps["goal"]["milestones"][number]["tasks"] = [];
        for (const t of ms.tasks ?? []) {
          const normalizedPriority = VALID_PRIORITIES.has(t.priority?.toLowerCase?.())
            ? t.priority.toLowerCase()
            : "medium";
          const taskRes = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              milestoneId: createdMs.id,
              title: t.title,
              priority: normalizedPriority,
            }),
          });
          if (taskRes.ok) {
            const taskData = await taskRes.json();
            if (taskData.task) createdTasks.push(taskData.task);
          }
        }

        createdMilestones.push({
          ...createdMs,
          tasks: createdTasks,
        });
      }

      setMilestones((prev) => [...prev, ...createdMilestones]);
      setDeconstructResult(null);
      toast({
        title: "Roadmap created",
        description: `Added ${createdMilestones.length} milestone${createdMilestones.length === 1 ? "" : "s"} and their tasks to this goal.`,
        type: "success",
      });
      router.refresh();
    } catch (err) {
      setDeconstructError({
        message:
          err instanceof Error
            ? err.message
            : "Failed to create milestones and tasks. Please try again.",
      });
    } finally {
      setCommittingDeconstruct(false);
    }
  }

  async function createMilestone(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
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
        const data = await res.json().catch(() => ({}));
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
      {/* Top Breadcrumb & Quick Links */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/workspace/${workspaceId}/goals`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate hover:text-ink transition-colors"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to Goals
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/workspace/${workspaceId}/roadmap`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate hover:text-blue bg-white border border-border rounded-xl px-3 py-1.5 transition-colors"
          >
            <MapIcon size={13} aria-hidden="true" /> Roadmap
          </Link>
          <Link
            href={`/workspace/${workspaceId}/board`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate hover:text-blue bg-white border border-border rounded-xl px-3 py-1.5 transition-colors"
          >
            <LayoutGrid size={13} aria-hidden="true" /> Board
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={handleDeleteGoal}
              disabled={deletingGoal}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:bg-red-50 bg-white border border-border rounded-xl px-3 py-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 size={13} aria-hidden="true" />
              {deletingGoal ? "Deleting…" : "Delete Goal"}
            </button>
          )}
        </div>
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Status & Target Date */}
            <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
              {canEdit ? (
                <select
                  aria-label="Goal status"
                  value={goalStatus}
                  onChange={(e) => void handleStatusChange(e.target.value)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 ${
                    goalStatus === "active"
                      ? "bg-blue-faint text-blue border-blue-light"
                      : goalStatus === "completed"
                      ? "bg-green-100 text-success border-green-200"
                      : goalStatus === "cancelled"
                      ? "bg-red-50 text-danger border-red-200"
                      : "bg-offwhite text-slate border-border"
                  }`}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              ) : (
                <span
                  className={`text-xs font-medium px-2.5 py-0.5 rounded-full capitalize ${
                    goalStatus === "active"
                      ? "bg-blue-faint text-blue"
                      : goalStatus === "completed"
                      ? "bg-green-100 text-success"
                      : goalStatus === "cancelled"
                      ? "bg-red-50 text-danger"
                      : "bg-border text-muted"
                  }`}
                >
                  {goalStatus}
                </span>
              )}

              {canEdit ? (
                <label className="inline-flex items-center gap-1.5 text-xs text-slate bg-offwhite border border-border rounded-lg px-2 py-0.5">
                  <Calendar size={12} className="text-muted" aria-hidden="true" />
                  <span className="sr-only">Target date</span>
                  <input
                    type="date"
                    value={goalTargetDate}
                    onChange={(e) => void handleTargetDateChange(e.target.value)}
                    className="bg-transparent text-xs text-ink focus:outline-none cursor-pointer"
                  />
                </label>
              ) : (
                goalTargetDate && (
                  <span className="text-xs text-muted">
                    Due {new Date(goalTargetDate).toLocaleDateString()}
                  </span>
                )
              )}
            </div>

            {goalSaveError && !editingGoalField && (
              <p
                role="alert"
                className="mb-2 text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"
              >
                {goalSaveError}
              </p>
            )}

            {/* Title */}
            <h1 className="text-xl font-bold text-ink">
              {editingGoalField === "title" && canEdit ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={goalTitle}
                      onChange={(e) => {
                        setGoalTitle(e.target.value);
                        setGoalSaveError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && goalTitle.length <= 200) {
                          e.preventDefault();
                          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                          void saveGoalField("title", goalTitle);
                        }
                        if (e.key === "Escape") {
                          setGoalTitle(savedTitle);
                          setEditingGoalField(null);
                          setGoalSaveError("");
                        }
                      }}
                      className="flex-1 text-xl font-bold text-ink border-b-2 border-blue bg-transparent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void saveGoalField("title", goalTitle)}
                      disabled={goalSaving || goalTitle.length > 200 || !goalTitle.trim()}
                      className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50 cursor-pointer"
                    >
                      {goalSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGoalTitle(savedTitle);
                        setEditingGoalField(null);
                        setGoalSaveError("");
                      }}
                      className="text-xs text-muted hover:text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    {goalSaveError ? (
                      <p role="alert" className="text-xs text-danger font-medium">
                        {goalSaveError}
                      </p>
                    ) : goalTitle.length > 200 ? (
                      <p role="alert" className="text-xs text-danger font-medium">
                        Title is too long (max 200 characters)
                      </p>
                    ) : (
                      <span />
                    )}
                    <span
                      className={`text-[11px] tabular-nums ${
                        goalTitle.length > 200
                          ? "text-danger font-semibold"
                          : goalTitle.length > 180
                          ? "text-warning"
                          : "text-muted"
                      }`}
                    >
                      {goalTitle.length}/200
                    </span>
                  </div>
                </div>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditingGoalField("title")}
                  className="text-left hover:text-blue transition-colors group w-full cursor-pointer"
                  title="Click to edit title"
                >
                  {goalTitle}
                  <span className="ml-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity text-xs text-muted font-normal">
                    ✎
                  </span>
                </button>
              ) : (
                <span>{goalTitle}</span>
              )}
            </h1>

            {/* Objective */}
            <div className="text-slate text-sm mt-2">
              {editingGoalField === "objective" && canEdit ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={goalObjective}
                    onChange={(e) => {
                      setGoalObjective(e.target.value);
                      setGoalSaveError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setGoalObjective(savedObjective);
                        setEditingGoalField(null);
                        setGoalSaveError("");
                      }
                    }}
                    rows={3}
                    className="w-full text-sm text-slate border border-blue/40 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue/20 bg-white resize-none"
                  />
                  <div className="flex items-center justify-between">
                    {goalSaveError ? (
                      <p role="alert" className="text-xs text-danger font-medium">
                        {goalSaveError}
                      </p>
                    ) : goalObjective.length > 2000 ? (
                      <p role="alert" className="text-xs text-danger font-medium">
                        Objective is too long (max 2000 characters)
                      </p>
                    ) : (
                      <span />
                    )}
                    <span
                      className={`text-[11px] tabular-nums ${
                        goalObjective.length > 2000
                          ? "text-danger font-semibold"
                          : goalObjective.length > 1800
                          ? "text-warning"
                          : "text-muted"
                      }`}
                    >
                      {goalObjective.length}/2000
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveGoalField("objective", goalObjective)}
                      disabled={goalSaving || goalObjective.length > 2000 || !goalObjective.trim()}
                      className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50 cursor-pointer"
                    >
                      {goalSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGoalObjective(savedObjective);
                        setEditingGoalField(null);
                        setGoalSaveError("");
                      }}
                      className="text-xs text-muted hover:text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={() => setEditingGoalField("objective")}
                  className="text-left hover:text-ink transition-colors group w-full cursor-pointer"
                  title="Click to edit objective"
                >
                  {goalObjective}
                  <span className="ml-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity text-xs text-muted">
                    ✎
                  </span>
                </button>
              ) : (
                <p>{goalObjective}</p>
              )}
            </div>
          </div>
          <div className="sm:shrink-0">
            <GoalHealthScore score={health} size="md" />
          </div>
        </div>

        {/* Key Results Section (with full CRUD) */}
        <div className="mt-5 pt-5 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
              Key Results ({keyResults.length})
            </h3>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setShowAddKr((prev) => !prev);
                  setKrError("");
                }}
                className="text-xs text-blue hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <Plus size={13} aria-hidden="true" /> Add Key Result
              </button>
            )}
          </div>

          {krError && (
            <p
              role="alert"
              className="mb-3 text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2"
            >
              {krError}
            </p>
          )}

          {showAddKr && canEdit && (
            <form
              onSubmit={handleAddKeyResult}
              className="mb-4 bg-offwhite border border-border rounded-xl p-3.5 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                <div className="sm:col-span-5">
                  <label htmlFor="new-kr-title" className="block text-[11px] font-medium text-slate mb-1">
                    Title *
                  </label>
                  <input
                    id="new-kr-title"
                    type="text"
                    value={newKrTitle}
                    onChange={(e) => setNewKrTitle(e.target.value)}
                    placeholder="e.g. Increase activation rate"
                    className="w-full border border-border bg-white rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-blue"
                    autoFocus
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="new-kr-current" className="block text-[11px] font-medium text-slate mb-1">
                    Current
                  </label>
                  <input
                    id="new-kr-current"
                    type="number"
                    min={0}
                    step="any"
                    value={newKrCurrent}
                    onChange={(e) => setNewKrCurrent(e.target.value)}
                    className="w-full border border-border bg-white rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-blue"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label htmlFor="new-kr-target" className="block text-[11px] font-medium text-slate mb-1">
                    Target *
                  </label>
                  <input
                    id="new-kr-target"
                    type="number"
                    min={1}
                    step="any"
                    value={newKrTarget}
                    onChange={(e) => setNewKrTarget(e.target.value)}
                    className="w-full border border-border bg-white rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-blue"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="new-kr-unit" className="block text-[11px] font-medium text-slate mb-1">
                    Unit
                  </label>
                  <input
                    id="new-kr-unit"
                    type="text"
                    value={newKrUnit}
                    onChange={(e) => setNewKrUnit(e.target.value)}
                    placeholder="%"
                    className="w-full border border-border bg-white rounded-lg px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:border-blue"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddKr(false);
                    setKrError("");
                  }}
                  className="px-3 py-1.5 text-xs text-slate hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={krSaving}
                  className="bg-blue text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-mid disabled:opacity-50 cursor-pointer"
                >
                  {krSaving ? "Saving…" : "Add Key Result"}
                </button>
              </div>
            </form>
          )}

          {keyResults.length === 0 ? (
            <p className="text-xs text-muted italic">
              No key results defined yet.{canEdit ? " Add measurable targets to track progress." : ""}
            </p>
          ) : (
            <div className="space-y-3">
              {keyResults.map((kr) => {
                const safeTarget = kr.target > 0 ? kr.target : 0;
                const pct =
                  safeTarget > 0
                    ? Math.max(0, Math.min(100, Math.round((kr.current / safeTarget) * 100)))
                    : 0;
                const isEditingThis = editingKrId === kr.id;

                return (
                  <div key={kr.id} className="group rounded-xl border border-border/60 p-3 bg-offwhite/40">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-medium text-ink">{kr.title}</span>
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={editKrCurrent}
                            onChange={(e) => setEditKrCurrent(e.target.value)}
                            aria-label={`Current value for ${kr.title}`}
                            className="w-20 border border-blue/40 bg-white rounded-md px-2 py-0.5 text-xs text-ink"
                          />
                          <span className="text-xs text-muted">/</span>
                          <input
                            type="number"
                            min={1}
                            step="any"
                            value={editKrTarget}
                            onChange={(e) => setEditKrTarget(e.target.value)}
                            aria-label={`Target value for ${kr.title}`}
                            className="w-20 border border-blue/40 bg-white rounded-md px-2 py-0.5 text-xs text-ink"
                          />
                          <span className="text-xs text-muted">{kr.unit}</span>
                          <button
                            type="button"
                            disabled={krSaving}
                            onClick={() => void handleSaveKrProgress(kr.id)}
                            className="text-xs text-blue font-semibold px-2 py-0.5 bg-blue-faint rounded-md cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingKrId(null)}
                            className="text-xs text-muted hover:text-ink cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold text-ink tabular-nums">
                            {kr.current} / {kr.target} {kr.unit}
                            <span className="ml-1.5 text-xs font-normal text-muted">({pct}%)</span>
                          </span>
                          {canEdit && (
                            <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingKrId(kr.id);
                                  setEditKrCurrent(String(kr.current));
                                  setEditKrTarget(String(kr.target));
                                  setKrError("");
                                }}
                                aria-label={`Update progress for ${kr.title}`}
                                className="p-1 text-muted hover:text-blue rounded cursor-pointer"
                              >
                                <Pencil size={12} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteKr(kr)}
                                aria-label={`Delete ${kr.title}`}
                                className="p-1 text-muted hover:text-danger rounded cursor-pointer"
                              >
                                <Trash2 size={12} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* AI Deconstruct */}
        <div className="mt-5 pt-5 border-t border-border">
          <button
            type="button"
            onClick={() => void deconstructGoal()}
            disabled={deconstructLoading}
            className="flex items-center gap-2 text-sm text-blue hover:text-blue-mid font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {deconstructLoading ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <Zap size={14} aria-hidden="true" />
            )}
            {deconstructLoading ? "Analysing…" : "Deconstruct with AI →"}
          </button>

          {deconstructError && (
            <div
              role="alert"
              className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-danger flex flex-wrap items-center justify-between gap-2"
            >
              <span>{deconstructError.message}</span>
              {deconstructError.isUpgrade && (
                <Link
                  href={`/workspace/${workspaceId}/settings`}
                  className="font-semibold text-blue hover:underline shrink-0"
                >
                  Upgrade plan →
                </Link>
              )}
            </div>
          )}

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
                  <span className="text-xs font-semibold text-ink uppercase tracking-wide">
                    Suggested Milestones
                  </span>
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
                            <span
                              key={ti}
                              className="text-[10px] px-2 py-0.5 bg-offwhite border border-border rounded-full text-slate"
                            >
                              {t.title}
                            </span>
                          ))}
                          {ms.tasks.length > 4 && (
                            <span className="text-[10px] text-muted">
                              +{ms.tasks.length - 4} more
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {deconstructResult.risks && deconstructResult.risks.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <span className="text-xs font-semibold text-amber-800 block mb-1">
                    Risks to watch
                  </span>
                  <ul className="text-xs text-amber-700 space-y-0.5 list-disc pl-4">
                    {deconstructResult.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                {canEdit && deconstructResult.milestones && deconstructResult.milestones.length > 0 && (
                  <button
                    type="button"
                    disabled={committingDeconstruct}
                    onClick={() => void commitDeconstructedPlan()}
                    className="inline-flex items-center gap-1.5 bg-blue text-white px-4 py-2 rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {committingDeconstruct ? (
                      <>
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        Creating Milestones & Tasks…
                      </>
                    ) : (
                      <>
                        <Plus size={13} aria-hidden="true" />
                        Create Milestones & Tasks
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDeconstructResult(null)}
                  className="text-xs text-muted hover:text-ink transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Milestones */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Milestones ({milestones.length})</h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowAddMilestone(true)}
              className="text-sm text-blue hover:underline flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <Plus size={14} aria-hidden="true" /> Add Milestone
            </button>
          )}
        </div>

        {/* Inline Create Form */}
        {showAddMilestone && canEdit && (
          <form
            onSubmit={createMilestone}
            className="mb-4 bg-offwhite border border-border rounded-xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">
                New Milestone
              </h3>
              <button
                type="button"
                aria-label="Close new milestone form"
                onClick={() => {
                  setShowAddMilestone(false);
                  setMsError("");
                }}
                className="text-muted hover:text-ink p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            {msError && (
              <p
                role="alert"
                className="text-xs text-danger font-medium bg-red-50 border border-red-200 rounded-lg p-2"
              >
                {msError}
              </p>
            )}
            <div>
              <label htmlFor="goal-inline-ms-title" className="sr-only">
                Milestone title
              </label>
              <input
                id="goal-inline-ms-title"
                type="text"
                value={msTitle}
                onChange={(e) => setMsTitle(e.target.value)}
                placeholder="Milestone title (e.g. Core Architecture Setup)"
                className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="goal-inline-ms-desc" className="sr-only">
                Description
              </label>
              <textarea
                id="goal-inline-ms-desc"
                value={msDescription}
                onChange={(e) => setMsDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="goal-inline-ms-date" className="block text-xs font-medium text-slate mb-1">
                  Target Date
                </label>
                <input
                  id="goal-inline-ms-date"
                  type="date"
                  value={msTargetDate}
                  onChange={(e) => setMsTargetDate(e.target.value)}
                  className="w-full border border-border bg-white rounded-xl px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue/30"
                />
              </div>
              <div>
                <label htmlFor="goal-inline-ms-status" className="block text-xs font-medium text-slate mb-1">
                  Status
                </label>
                <select
                  id="goal-inline-ms-status"
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
                onClick={() => {
                  setShowAddMilestone(false);
                  setMsError("");
                }}
                className="px-3 py-1.5 text-xs text-slate hover:text-ink font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={msSubmitting}
                className="bg-blue text-white px-4 py-1.5 rounded-xl text-xs font-semibold hover:bg-blue-mid disabled:opacity-50 transition-colors cursor-pointer"
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
                  {editingMsId === ms.id && editingMsField === "title" && canEdit ? (
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={editingMsValue}
                          onChange={(e) => {
                            setEditingMsValue(e.target.value);
                            setMsSaveError("");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingMsValue.length <= 300) {
                              e.preventDefault();
                              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                              void saveMilestoneField(ms.id, "title");
                            }
                            if (e.key === "Escape") {
                              setEditingMsId(null);
                              setEditingMsField(null);
                              setMsSaveError("");
                            }
                          }}
                          className="flex-1 text-sm font-medium text-ink border-b border-blue bg-transparent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void saveMilestoneField(ms.id, "title")}
                          disabled={msSaving || editingMsValue.length > 300}
                          className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                          {msSaving ? "…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsId(null);
                            setEditingMsField(null);
                            setMsSaveError("");
                          }}
                          aria-label="Cancel editing"
                          className="text-xs text-muted hover:text-ink shrink-0 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        {msSaveError ? (
                          <p role="alert" className="text-xs text-danger font-medium">
                            {msSaveError}
                          </p>
                        ) : editingMsValue.length > 300 ? (
                          <p role="alert" className="text-xs text-danger font-medium">
                            Too long (max 300 characters)
                          </p>
                        ) : (
                          <span />
                        )}
                        <span
                          className={`text-[11px] tabular-nums ${
                            editingMsValue.length > 300
                              ? "text-danger font-semibold"
                              : editingMsValue.length > 270
                              ? "text-warning"
                              : "text-muted"
                          }`}
                        >
                          {editingMsValue.length}/300
                        </span>
                      </div>
                    </div>
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => startMsEdit(ms.id, "title", ms.title)}
                      className="font-medium text-ink text-sm text-left hover:text-blue transition-colors group flex-1 cursor-pointer"
                      title="Click to edit"
                    >
                      {ms.title}
                      <span className="ml-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity text-xs text-muted font-normal">
                        ✎
                      </span>
                    </button>
                  ) : (
                    <span className="font-medium text-ink text-sm flex-1">{ms.title}</span>
                  )}

                  {!(editingMsId === ms.id && editingMsField === "title") && (
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      {ms.targetDate && (
                        <span className="text-xs text-muted">
                          {new Date(ms.targetDate).toLocaleDateString()}
                        </span>
                      )}
                      <Link
                        href={`/workspace/${workspaceId}/roadmap?milestoneId=${ms.id}`}
                        className="text-[11px] font-medium text-blue hover:underline"
                      >
                        View on Roadmap
                      </Link>
                    </div>
                  )}
                </div>

                {/* Description — editable */}
                {editingMsId === ms.id && editingMsField === "description" && canEdit ? (
                  <div className="mb-2 space-y-1.5">
                    <textarea
                      autoFocus
                      value={editingMsValue}
                      onChange={(e) => {
                        setEditingMsValue(e.target.value);
                        setMsSaveError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditingMsId(null);
                          setEditingMsField(null);
                          setMsSaveError("");
                        }
                      }}
                      rows={2}
                      placeholder="Add a description…"
                      className="w-full text-xs text-slate border border-blue/40 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue/20 bg-white resize-none"
                    />
                    <div className="flex items-center justify-between">
                      {msSaveError ? (
                        <p role="alert" className="text-xs text-danger font-medium">
                          {msSaveError}
                        </p>
                      ) : editingMsValue.length > 1000 ? (
                        <p role="alert" className="text-xs text-danger font-medium">
                          Too long (max 1000 characters)
                        </p>
                      ) : (
                        <span />
                      )}
                      <span
                        className={`text-[11px] tabular-nums ${
                          editingMsValue.length > 1000
                            ? "text-danger font-semibold"
                            : editingMsValue.length > 900
                            ? "text-warning"
                            : "text-muted"
                        }`}
                      >
                        {editingMsValue.length}/1000
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void saveMilestoneField(ms.id, "description")}
                        disabled={msSaving || editingMsValue.length > 1000}
                        className="text-xs text-blue font-semibold hover:text-blue-mid disabled:opacity-50 cursor-pointer"
                      >
                        {msSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMsId(null);
                          setEditingMsField(null);
                          setMsSaveError("");
                        }}
                        className="text-xs text-muted hover:text-ink cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : canEdit ? (
                  <button
                    type="button"
                    onClick={() => startMsEdit(ms.id, "description", ms.description)}
                    className="block text-left w-full mb-2 group cursor-pointer"
                    title="Click to edit description"
                  >
                    {ms.description ? (
                      <span className="text-xs text-slate group-hover:text-ink transition-colors">
                        {ms.description}{" "}
                        <span className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity text-muted">
                          ✎
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted opacity-80 md:opacity-0 md:group-hover:opacity-70 md:group-focus-within:opacity-70 transition-opacity">
                        + Add description
                      </span>
                    )}
                  </button>
                ) : (
                  ms.description && <p className="text-xs text-slate mb-2">{ms.description}</p>
                )}

                {/* Clickable Linked Task Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {(ms.tasks ?? []).slice(0, 5).map((t) => (
                    <Link
                      key={t.id}
                      href={`/workspace/${workspaceId}/tasks?taskId=${t.id}`}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors hover:border-blue hover:text-blue ${
                        t.status === "done"
                          ? "bg-green-50 border-green-200 text-success"
                          : t.status === "blocked"
                          ? "bg-red-50 border-red-200 text-danger"
                          : "bg-offwhite border-border text-slate"
                      }`}
                    >
                      {t.title.slice(0, 30)}
                    </Link>
                  ))}
                  {(ms.tasks ?? []).length > 5 && (
                    <Link
                      href={`/workspace/${workspaceId}/tasks`}
                      className="text-[10px] text-muted hover:text-blue"
                    >
                      +{(ms.tasks ?? []).length - 5} more
                    </Link>
                  )}
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
          <Link
            href={`/workspace/${workspaceId}/docs/new?linkedGoalId=${goal.id}`}
            className="text-sm text-blue hover:underline flex items-center gap-1"
          >
            <FileText size={13} aria-hidden="true" /> Add doc
          </Link>
        </div>
        {goal.documents.length === 0 ? (
          <p className="text-sm text-muted">No docs linked yet.</p>
        ) : (
          <div className="space-y-2">
            {goal.documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/workspace/${workspaceId}/docs/${doc.id}`}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-offwhite transition-colors"
              >
                <FileText size={14} className="text-blue shrink-0" aria-hidden="true" />
                <span className="text-sm text-ink flex-1">{doc.title}</span>
                <span className="text-xs text-muted">{doc.author?.name}</span>
                <ChevronRight size={14} className="text-muted" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <h2 className="font-semibold text-ink mb-4">
          <span className="flex items-center gap-2">
            <MessageCircle size={16} aria-hidden="true" /> Comments ({comments.length})
          </span>
        </h2>

        {commentError && (
          <p
            role="alert"
            className="mb-3 text-xs text-danger bg-red-50 border border-red-200 rounded-lg px-3 py-2"
          >
            {commentError}
          </p>
        )}

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
                        type="button"
                        disabled={Boolean(savingCommentId || deletingCommentId)}
                        onClick={() => {
                          setEditingCommentId(c.id);
                          setEditingBody(c.body);
                          setCommentError("");
                        }}
                        className="text-[11px] text-muted hover:text-blue transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deletingCommentId === c.id}
                        onClick={() => void deleteComment(c.id)}
                        className="text-[11px] text-muted hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {deletingCommentId === c.id ? "Deleting…" : "Delete"}
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
                      onSubmit={() => void saveCommentEdit(c.id)}
                      className="w-full border border-blue/40 rounded-xl px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue/20 bg-white"
                    />
                    <button
                      type="button"
                      disabled={savingCommentId === c.id || !editingBody.trim()}
                      onClick={() => void saveCommentEdit(c.id)}
                      className="text-xs text-blue font-semibold hover:text-blue-mid px-2.5 py-1.5 bg-blue-faint rounded-lg border border-blue-light shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      {savingCommentId === c.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCommentId(null)}
                      className="text-xs text-muted hover:text-ink shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate mt-0.5 whitespace-pre-wrap">
                    {renderMentionedBody(c.body)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <MentionInput
            value={comment}
            onChange={setComment}
            onSubmit={() => void postComment()}
            workspaceId={workspaceId}
            placeholder="Add a comment… (Type @ to mention someone)"
          />
          <button
            type="button"
            onClick={() => void postComment()}
            disabled={!comment.trim() || postingComment}
            className="bg-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
          >
            {postingComment ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
