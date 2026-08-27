"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, ArrowRight, Lock } from "lucide-react";

interface Props {
  workspaceId: string;
  templateId: string;
  templateName: string;
  canApply: boolean;
}

export function TemplateApplyButton({ workspaceId, templateId, templateName, canApply }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  async function apply() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: templateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to apply template.");
      } else {
        setDone(true);
        setConfirming(false);
        setTimeout(() => {
          router.push(`/workspace/${workspaceId}/board`);
          router.refresh();
        }, 1200);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!canApply) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted">
        <Lock size={12} />
        Only admins and PMs can apply templates
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex items-center gap-2 text-sm text-success font-medium">
        <CheckCircle2 size={15} />
        Applied — redirecting to board…
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate">
          This will add sample data from <strong>{templateName}</strong> to your workspace. Existing data won&apos;t be affected.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={apply}
            disabled={loading}
            className="flex items-center gap-1.5 bg-blue text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
            {loading ? "Applying…" : "Confirm"}
          </button>
          <button
            onClick={() => { setConfirming(false); setError(""); }}
            disabled={loading}
            className="text-xs text-slate hover:text-ink border border-border rounded-lg px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="flex items-center gap-1.5 text-sm font-semibold text-blue hover:text-blue-mid transition-colors"
    >
      Apply template <ArrowRight size={14} />
    </button>
  );
}
