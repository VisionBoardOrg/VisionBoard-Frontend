"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useConfirm } from "@/context/ConfirmContext";

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
  const router = useRouter();
  const { confirm: confirmDialog } = useConfirm();

  // Track saved baseline so reverting edits works accurately without stale props
  const [savedPlan, setSavedPlan] = useState(currentPlan);
  const [savedCredits, setSavedCredits] = useState(currentAiCredits);
  const [savedScheduledDeletion, setSavedScheduledDeletion] = useState(scheduledDeletion);

  const [plan, setPlan] = useState(currentPlan);
  const [aiCredits, setAiCredits] = useState(String(currentAiCredits));
  const [cancelDeletion, setCancelDeletion] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const trimmedCredits = aiCredits.trim();
  const parsedCredits = Number(trimmedCredits);
  const isCreditsInvalid =
    trimmedCredits === "" ||
    !Number.isFinite(parsedCredits) ||
    !Number.isInteger(parsedCredits) ||
    parsedCredits < 0;

  const planChanged = plan !== savedPlan;
  const creditsChanged = !isCreditsInvalid && parsedCredits !== savedCredits;
  const deletionChanged = Boolean(cancelDeletion && savedScheduledDeletion);
  const isDirty = planChanged || creditsChanged || deletionChanged || isCreditsInvalid;

  async function handleSave() {
    setErrorMsg("");

    if (isCreditsInvalid) {
      setStatus("error");
      setErrorMsg("AI Credits Used must be a non-negative whole number.");
      return;
    }

    const body: Record<string, unknown> = {};
    if (planChanged) body.plan = plan;
    if (creditsChanged) body.aiCreditsUsed = parsedCredits;
    if (deletionChanged) body.scheduledDeletion = null;

    if (Object.keys(body).length === 0) {
      setStatus("idle");
      return;
    }

    // Require explicit confirmation before overriding billing plan tier or cancelling GDPR deletion
    if (planChanged || deletionChanged) {
      const reasons: string[] = [];
      if (planChanged) {
        reasons.push(`change billing plan tier from "${savedPlan}" to "${plan}"`);
      }
      if (deletionChanged) {
        reasons.push("cancel the user's GDPR scheduled account deletion");
      }
      const confirmed = await confirmDialog({
        title: "Confirm sensitive account change",
        description: `You are about to ${reasons.join(" and ")}. Are you sure you want to proceed?`,
        confirmLabel: "Apply changes",
        danger: true,
      });
      if (!confirmed) return;
    }

    setStatus("saving");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save changes.");
      }

      if (planChanged) setSavedPlan(plan);
      if (creditsChanged) setSavedCredits(parsedCredits);
      if (deletionChanged) {
        setSavedScheduledDeletion(null);
        setCancelDeletion(false);
      }

      setStatus("saved");
      router.refresh();
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
          <label htmlFor="admin-edit-plan" className="block text-xs font-bold text-ink mb-1.5">
            Plan Tier
          </label>
          <select
            id="admin-edit-plan"
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              if (status === "error") setStatus("idle");
            }}
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
          <label htmlFor="admin-edit-credits" className="block text-xs font-bold text-ink mb-1.5">
            AI Credits Used
          </label>
          <input
            id="admin-edit-credits"
            type="number"
            min={0}
            step={1}
            value={aiCredits}
            onChange={(e) => {
              setAiCredits(e.target.value);
              if (status === "error") {
                setStatus("idle");
                setErrorMsg("");
              }
            }}
            aria-invalid={isCreditsInvalid}
            className={`w-full bg-offwhite/50 border rounded-xl px-3 py-2.5 text-sm font-medium text-ink placeholder:text-muted focus:outline-none focus:ring-2 transition-all ${
              isCreditsInvalid
                ? "border-danger focus:ring-danger/20 focus:border-danger"
                : "border-border focus:ring-blue/30 focus:border-blue"
            }`}
          />
          {isCreditsInvalid ? (
            <p role="alert" className="text-xs text-danger font-medium mt-1">
              Enter a valid whole number (0 or greater).
            </p>
          ) : (
            <p className="text-xs text-muted font-medium mt-1">
              Set to 0 to reset the monthly counter.
            </p>
          )}
        </div>

        {/* Cancel scheduled deletion */}
        {savedScheduledDeletion && (
          <div className="bg-danger/5 border border-danger/20 rounded-xl p-3">
            <p className="text-xs font-semibold text-danger mb-2 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              Deletion scheduled for{" "}
              {new Date(savedScheduledDeletion).toLocaleDateString()}
            </p>
            <label
              htmlFor="admin-cancel-deletion"
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                id="admin-cancel-deletion"
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
        {status === "error" && errorMsg && (
          <div
            role="alert"
            className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-2 text-xs text-danger font-medium"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
        {status === "saved" && (
          <div
            role="status"
            className="bg-success/10 border border-success/20 rounded-xl p-3 flex items-center gap-2 text-xs text-success font-semibold"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>Changes saved successfully.</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isDirty || status === "saving" || isCreditsInvalid}
          className="w-full inline-flex items-center justify-center gap-2 bg-blue text-white font-bold text-sm py-2.5 px-4 rounded-xl hover:bg-blue-mid transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {status === "saving" ? (
            <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="w-4 h-4" aria-hidden="true" />
          )}
          {status === "saving" ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
