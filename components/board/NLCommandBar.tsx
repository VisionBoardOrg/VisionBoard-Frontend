"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Zap, X, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import type { AIBoardAction } from "@/types/board";
import { useModalA11y } from "@/hooks/useModalA11y";

interface NLCommandBarProps {
  workspaceId: string;
  onClose: () => void;
  onAction: (action: AIBoardAction) => void | Promise<void>;
}

export function NLCommandBar({ workspaceId, onClose, onAction }: NLCommandBarProps) {
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pendingAction, setPendingAction] = useState<AIBoardAction | null>(null);
  const [error, setError] = useState("");
  const [upgradePrompt, setUpgradePrompt] = useState("");
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useModalA11y(dialogRef, onClose, true, { initialFocusRef: inputRef });

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  function cancelRequest() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!command.trim() || loading) return;
    setLoading(true);
    setError("");
    setUpgradePrompt("");
    setPendingAction(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/ai/nl-board-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim(), workspaceId }),
        signal: controller.signal,
      });

      let data: Record<string, unknown> = {};
      try {
        data = (await res.json()) as Record<string, unknown>;
      } catch {
        // Non-JSON response (e.g. proxy 502/504 HTML)
      }

      if (!res.ok) {
        setError(
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : `Failed to parse command (${res.status}).`
        );
        if (res.status === 403 && typeof data.upgradePrompt === "string") {
          setUpgradePrompt(data.upgradePrompt);
        }
      } else if (data.action && typeof data.action === "object") {
        setPendingAction(data.action as AIBoardAction);
      } else {
        setError("AI returned an unexpected response. Please try again.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("Request cancelled.");
      } else {
        setError("Network error. Please try again.");
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  }

  async function applyAction() {
    if (!pendingAction || applying) return;
    setApplying(true);
    setError("");
    try {
      await onAction(pendingAction);
      setApplied(true);
      setTimeout(onClose, 800);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not apply the proposed change. Please try again."
      );
    } finally {
      setApplying(false);
    }
  }

  const EXAMPLES = [
    "Mark the onboarding goal as active",
    "Move the auth milestone to completed",
    "Create a task to write release notes",
  ];

  /** Human-readable label for a raw change key (e.g. "dueDate" → "Due date") */
  const CHANGE_LABELS: Record<string, string> = {
    status: "Status",
    assignees: "People",
    dueDate: "Due date",
    startDate: "Start date",
    title: "Title",
    priority: "Priority",
    milestone: "Milestone",
    milestoneId: "Milestone",
    goalId: "Goal",
    objective: "Objective",
    storyPoints: "Story points",
  };

  function formatChangeValue(value: unknown): string {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) {
      return value
        .map((v) =>
          typeof v === "object" && v !== null
            ? Object.values(v as Record<string, unknown>).join(" · ")
            : String(v)
        )
        .join(", ");
    }
    const str = String(value);
    // Pretty-print ISO dates and snake_case enum values
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
    }
    return str.replace(/_/g, " ");
  }

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="nl-command-bar-title"
      className="m-auto w-[calc(100%-2rem)] max-w-xl p-0 bg-transparent border-0 backdrop:bg-ink/25 backdrop:backdrop-blur-xs"
    >
      <div className="bg-white rounded-2xl border border-border shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Zap size={16} className="text-blue shrink-0" aria-hidden="true" />
            <h2 id="nl-command-bar-title" className="text-sm font-semibold text-ink flex-1">
              AI Board Edit
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-4">
            <input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={loading || applying}
              placeholder='e.g. "Move the auth milestone to completed"'
              className="w-full text-sm text-ink placeholder:text-muted focus:outline-none disabled:opacity-60"
            />
            <div className="flex flex-wrap justify-between items-center gap-2 mt-3">
              <span className="text-xs text-muted">
                AI will show a preview — you confirm before anything changes
              </span>
              <div className="flex items-center gap-2">
                {loading && (
                  <button
                    type="button"
                    onClick={cancelRequest}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border text-slate hover:bg-offwhite transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!command.trim() || loading || applying}
                  className="flex items-center gap-1.5 bg-blue text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Zap size={12} aria-hidden="true" />
                  )}
                  {loading ? "Parsing…" : "Parse intent"}
                </button>
              </div>
            </div>
          </form>

          {/* Error & optional upgrade prompt */}
          {error && (
            <div className="mx-4 mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-danger space-y-1.5" role="alert">
              <p className="font-medium">{error}</p>
              {upgradePrompt && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-red-200/70">
                  <span className="text-slate flex items-center gap-1">
                    <Sparkles size={12} className="text-blue shrink-0" aria-hidden="true" />
                    {upgradePrompt}
                  </span>
                  <Link
                    href="/settings/billing"
                    onClick={onClose}
                    className="text-blue font-semibold hover:underline shrink-0"
                  >
                    Upgrade plan →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Pending action confirmation */}
          {pendingAction && !applied && (
            <div className="mx-4 mb-4 p-4 bg-blue-faint border border-blue-light rounded-xl">
              <div className="text-xs font-semibold text-blue mb-2 uppercase tracking-wide">
                Proposed action ({pendingAction.action} {pendingAction.entity})
              </div>
              <p className="text-sm text-ink mb-3">{pendingAction.description}</p>
              {pendingAction.changes && Object.keys(pendingAction.changes).length > 0 && (
                <dl className="bg-white border border-border rounded-lg p-3 space-y-1.5">
                  {Object.entries(pendingAction.changes).map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-4 text-xs">
                      <dt className="text-slate shrink-0">
                        {CHANGE_LABELS[key] ??
                          key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())}
                      </dt>
                      <dd className="font-semibold text-ink text-right">{formatChangeValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={applyAction}
                  disabled={applying}
                  className="flex-1 bg-blue text-white text-xs font-semibold py-2 rounded-lg hover:bg-blue-mid transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {applying && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                  {applying ? "Applying…" : "✓ Apply changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={applying}
                  className="flex-1 border border-border bg-white text-xs font-medium py-2 rounded-lg text-slate hover:bg-offwhite transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {applied && (
            <div className="mx-4 mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-sm text-success">
              <CheckCircle2 size={14} aria-hidden="true" /> Changes applied successfully
            </div>
          )}

          {/* Examples */}
          {!pendingAction && !error && !applied && (
            <div className="px-4 pb-4">
              <div className="text-xs text-muted mb-2">Try these examples:</div>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setCommand(ex)}
                    className="text-xs px-2.5 py-1 bg-offwhite border border-border rounded-full text-slate hover:text-ink hover:border-blue/40 transition-colors cursor-pointer"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
    </dialog>
  );
}
