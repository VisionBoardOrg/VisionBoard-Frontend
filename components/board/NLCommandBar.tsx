"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, X, Loader2, CheckCircle2 } from "lucide-react";
import type { AIBoardAction } from "@/types/board";
import { useModalA11y } from "@/hooks/useModalA11y";

interface NLCommandBarProps {
  workspaceId: string;
  onClose: () => void;
  onAction: (action: AIBoardAction) => void;
}

export function NLCommandBar({ workspaceId, onClose, onAction }: NLCommandBarProps) {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<AIBoardAction | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || loading) return;
    setLoading(true);
    setError("");
    setPendingAction(null);

    try {
      const res = await fetch("/api/ai/nl-board-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim(), workspaceId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to parse command.");
      } else {
        setPendingAction(data.action as AIBoardAction);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function applyAction() {
    if (!pendingAction) return;
    onAction(pendingAction);
    setApplied(true);
    setTimeout(onClose, 800);
  }

  const EXAMPLES = [
    "Move the auth milestone to next sprint",
    "Mark the onboarding goal as in progress",
    "Assign the design milestone to Ade",
  ];

  /** Human-readable label for a raw change key (e.g. "dueDate" → "Due date") */
  const CHANGE_LABELS: Record<string, string> = {
    status: "Status",
    assignee: "Assignee",
    assigneeId: "Assignee",
    dueDate: "Due date",
    startDate: "Start date",
    title: "Title",
    priority: "Priority",
    sprint: "Sprint",
    sprintId: "Sprint",
    milestone: "Milestone",
    milestoneId: "Milestone",
    storyPoints: "Story points",
  };

  function formatChangeValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    const str = String(value);
    // Pretty-print ISO dates and snake_case enum values
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    return str.replace(/_/g, " ");
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-sm z-30"
        onClick={onClose}
        aria-label="Close command bar"
      />

      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="AI board edit"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-full max-w-xl"
        onKeyDown={handleKeyDown}
      >
        <div className="bg-white rounded-2xl border border-border shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Zap size={16} className="text-blue shrink-0" />
            <span className="text-sm font-semibold text-ink flex-1">AI Board Edit</span>
            <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4">
            <input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='e.g. "Move the auth milestone to next sprint and assign it to Ade"'
              className="w-full text-sm text-ink placeholder:text-muted focus:outline-none"
            />
            <div className="flex justify-between items-center mt-3">
              <span className="text-xs text-muted">AI will show a preview — you confirm before anything changes</span>
              <button
                type="submit"
                disabled={!command.trim() || loading}
                className="flex items-center gap-1.5 bg-blue text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-mid transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                Parse intent
              </button>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="mx-4 mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-danger">
              {error}
            </div>
          )}

          {/* Pending action confirmation */}
          {pendingAction && !applied && (
            <div className="mx-4 mb-4 p-4 bg-blue-faint border border-blue-light rounded-xl">
              <div className="text-xs font-semibold text-blue mb-2 uppercase tracking-wide">Proposed action</div>
              <p className="text-sm text-ink mb-3">{pendingAction.description}</p>
              {pendingAction.changes && Object.keys(pendingAction.changes).length > 0 && (
                <dl className="bg-white border border-border rounded-lg p-3 space-y-1.5">
                  {Object.entries(pendingAction.changes).map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-4 text-xs">
                      <dt className="text-slate shrink-0">
                        {CHANGE_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}
                      </dt>
                      <dd className="font-semibold text-ink text-right">{formatChangeValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={applyAction}
                  className="flex-1 bg-blue text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-mid transition-colors"
                >
                  ✓ Apply changes
                </button>
                <button
                  onClick={() => setPendingAction(null)}
                  className="flex-1 border border-border text-xs font-medium py-2 rounded-lg text-slate hover:bg-offwhite transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {applied && (
            <div className="mx-4 mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-sm text-success">
              <CheckCircle2 size={14} /> Changes applied successfully
            </div>
          )}

          {/* Examples */}
          {!pendingAction && !error && (
            <div className="px-4 pb-4">
              <div className="text-xs text-muted mb-2">Try these examples:</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setCommand(ex)}
                    className="text-xs px-2.5 py-1 bg-offwhite border border-border rounded-full text-slate hover:text-ink hover:border-blue/40 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
