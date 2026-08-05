"use client";

import { useState } from "react";
import { GoalHealthScore } from "@/components/dashboard/GoalHealthScore";
import { computeGoalHealth } from "@/lib/dashboard-utils";
import { Zap, FileText, MessageCircle, ChevronRight, CheckCircle2, Circle, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface KeyResult { id: string; title: string; target: number; current: number; unit: string }

interface DeconstructSprint {
  name: string;
  goal: string;
  durationWeeks: number;
  tasks: { title: string; priority: string; storyPoints: number; suggestedOwnerRole: string }[];
}

interface DeconstructResult {
  recommendation?: string;
  suggestedTimeline?: string;
  sprints?: DeconstructSprint[];
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
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState(goal.comments);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [deconstructResult, setDeconstructResult] = useState<DeconstructResult | null>(null);
  const [deconstructLoading, setDeconstructLoading] = useState(false);

  const health = computeGoalHealth({
    ...goal,
    milestones: goal.milestones.map((m) => ({
      ...m,
      tasks: m.tasks.map((t) => ({ ...t, storyPoints: t.storyPoints ?? 0 })),
    })),
  } as never);

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
    // Use objective if it has meaningful content, otherwise fall back to the
    // goal title so very short or untitled goals don't hit the min-length error.
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
            <h1 className="text-xl font-bold text-ink">{goal.title}</h1>
            <p className="text-slate text-sm mt-2">{goal.objective}</p>
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
              {deconstructResult.sprints && deconstructResult.sprints.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-ink uppercase tracking-wide">Suggested Sprints</span>
                  <div className="mt-2 space-y-2">
                    {deconstructResult.sprints.map((sprint, i) => (
                      <div key={i} className="bg-white border border-border rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm text-ink">{sprint.name}</span>
                          <span className="text-xs text-muted">{sprint.durationWeeks}w</span>
                        </div>
                        <p className="text-xs text-slate mb-2">{sprint.goal}</p>
                        <div className="flex flex-wrap gap-1">
                          {sprint.tasks.slice(0, 4).map((t, ti) => (
                            <span key={ti} className="text-[10px] px-2 py-0.5 bg-offwhite border border-border rounded-full text-slate">{t.title}</span>
                          ))}
                          {sprint.tasks.length > 4 && <span className="text-[10px] text-muted">+{sprint.tasks.length - 4} more</span>}
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
        <h2 className="font-semibold text-ink mb-4">Milestones ({goal.milestones.length})</h2>
        <div className="space-y-3">
          {goal.milestones.map((ms) => (
            <div key={ms.id} className="border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                {STATUS_ICON[ms.status]}
                <span className="font-medium text-ink text-sm">{ms.title}</span>
                {ms.targetDate && (
                  <span className="text-xs text-muted ml-auto">
                    {new Date(ms.targetDate).toLocaleDateString()}
                  </span>
                )}
              </div>
              {ms.description && <p className="text-xs text-slate mb-2">{ms.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {ms.tasks.slice(0, 5).map((t) => (
                  <span key={t.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    t.status === "done" ? "bg-green-50 border-green-200 text-success" :
                    t.status === "blocked" ? "bg-red-50 border-red-200 text-danger" :
                    "bg-offwhite border-border text-slate"
                  }`}>{t.title.slice(0, 30)}</span>
                ))}
                {ms.tasks.length > 5 && <span className="text-[10px] text-muted">+{ms.tasks.length - 5} more</span>}
              </div>
            </div>
          ))}
        </div>
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
                          if (!confirm("Delete this comment?")) return;
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
                  <div className="mt-1 flex gap-2">
                    <input
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Escape") { setEditingCommentId(null); return; }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
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
                        }
                      }}
                      className="flex-1 border border-blue/40 rounded-lg px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue/20"
                      autoFocus
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
                      className="text-xs text-blue font-semibold hover:text-blue-mid"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingCommentId(null)} className="text-xs text-muted hover:text-ink">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate mt-0.5">{c.body}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postComment(); } }}
            placeholder="Add a comment…"
            className="flex-1 border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue/30"
          />
          <button onClick={postComment} className="bg-blue text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-blue-mid transition-colors">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
