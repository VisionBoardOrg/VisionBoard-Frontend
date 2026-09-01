"use client";

import { useState } from "react";
import { Save, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

interface UserEditPanelProps {
  userId: string;
  currentPlan: string;
  currentAiCredits: number;
  scheduledDeletion: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function UserEditPanel({
  userId,
  currentPlan,
  currentAiCredits,
  scheduledDeletion,
}: UserEditPanelProps) {
  const [plan, setPlan] = useState(currentPlan);
  const [aiCredits, setAiCredits] = useState(String(currentAiCredits));
  const [cancelDeletion, setCancelDeletion] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSave() {
    setStatus("saving");
    setErrorMsg("");

    const body: Record<string, unknown> = {};
    if (plan !== currentPlan) body.plan = plan;
    if (parseInt(aiCredits, 10) !== currentAiCredits) {
      const n = parseInt(aiCredits, 10);
      if (!isNaN(n) && n >= 0) body.aiCreditsUsed = n;
    }
    if (cancelDeletion && scheduledDeletion) body.scheduledDeletion = null;

    if (Object.keys(body).length === 0) {
      setStatus("idle");
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }

      setStatus("saved");
      if (cancelDeletion) setCancelDeletion(false);
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-5 shadow-sm">
      <h2 className="text-sm font-bold text-ink mb-4">Edit User</h2>

      <div className="space-y-4">
        {/* Plan */}
        <div>
          <label className="block text-xs font-bold text-ink mb-1.5">Plan Tier</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full bg-offwhite/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
          >
            <option value="free">Free</option>
            <option value="startup">Startup</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* AI Credits */}
        <div>
          <label className="block text-xs font-bold text-ink mb-1.5">AI Credits Used</label>
          <input
            type="number"
            min={0}
            value={aiCredits}
            onChange={(e) => setAiCredits(e.target.value)}
            className="w-full bg-offwhite/50 border border-border rounded-xl px-3 py-2.5 text-sm font-medium text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
          />
          <p className="text-xs text-muted font-medium mt-1">
            Set to 0 to reset the monthly counter.
          </p>
        </div>

        {/* Cancel scheduled deletion */}
        {scheduledDeletion && (
          <div className="bg-danger/5 border border-danger/20 rounded-xl p-3">
            <p className="text-xs font-semibold text-danger mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Deletion scheduled for{" "}
              {new Date(scheduledDeletion).toLocaleDateString()}
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cancelDeletion}
                onChange={(e) => setCancelDeletion(e.target.checked)}
                className="rounded cursor-pointer"
              />
              <span className="text-xs font-semibold text-ink">
                Cancel scheduled deletion
              </span>
            </label>
          </div>
        )}

        {/* Feedback */}
        {status === "error" && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-2 text-xs text-danger font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {errorMsg}
          </div>
        )}
        {status === "saved" && (
          <div className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-2 text-xs text-success font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            Changes saved successfully.
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={status === "saving"}
          className="w-full inline-flex items-center justify-center gap-2 bg-blue text-white font-bold text-sm py-2.5 px-4 rounded-xl hover:bg-blue-mid transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {status === "saving" ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {status === "saving" ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
