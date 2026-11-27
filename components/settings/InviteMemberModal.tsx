"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus, X, Loader2, CheckCircle2, AlertCircle, Copy, Check } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useClipboard } from "@/hooks/useClipboard";
import { ROLE_LABELS } from "@/lib/roles";

interface InviteMemberModalProps {
  workspaceId: string;
  currentMemberCount: number;
  memberLimit: number | null;
}

const ROLES = [
  { value: "pm", label: ROLE_LABELS.pm, description: "Manage goals, roadmaps & board" },
  { value: "exec", label: ROLE_LABELS.exec, description: "Executive rollup & health view" },
  { value: "eng", label: ROLE_LABELS.eng, description: "Sprint tracking & blockers" },
  { value: "marketing", label: ROLE_LABELS.marketing, description: "Campaigns & timelines" },
  { value: "admin", label: ROLE_LABELS.admin, description: "Full workspace & settings access" },
];

export function InviteMemberModal({ workspaceId, currentMemberCount, memberLimit }: InviteMemberModalProps) {
  const router = useRouter();
  const modalRef = useRef<HTMLDialogElement>(null);
  const { copied, copyError, statusMessage, copy } = useClipboard();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("pm");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  const isAtLimit = typeof memberLimit === "number" && memberLimit > 0 && currentMemberCount >= memberLimit;

  function handleClose() {
    if (loading) return;
    setIsOpen(false);
    setEmail("");
    setRole("pm");
    setError("");
    setInviteUrl("");
  }

  useModalA11y(modalRef, handleClose, isOpen);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setError("");
    setInviteUrl("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Failed to send invitation.");
        return;
      }

      setInviteUrl(data.inviteUrl || "");
      router.refresh();
    } catch {
      setError("An unexpected network error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setInviteUrl("");
          setIsOpen(true);
        }}
        className="mt-4 w-full border border-dashed border-border text-sm text-muted hover:border-blue/40 hover:text-blue py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium cursor-pointer"
      >
        <UserPlus size={16} aria-hidden="true" />
        Invite team member
      </button>

      {isOpen && (
        <dialog
          ref={modalRef}
          {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
          aria-labelledby="invite-member-title"
          className="m-auto bg-white rounded-2xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-0 backdrop:bg-black/40 backdrop:backdrop-blur-xs"
        >
          <div>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-faint text-blue">
                  <UserPlus size={18} aria-hidden="true" />
                </div>
                <div>
                  <h1 id="invite-member-title" className="font-bold text-ink text-base">Invite Team Member</h1>
                  <p className="text-xs text-muted">Send an email invitation to your workspace.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors cursor-pointer"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {inviteUrl ? (
                <div className="space-y-4">
                  <div role="status" className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                    <div>
                      <div className="font-semibold">Invitation Email Sent!</div>
                      <div>An invitation link was dispatched to <strong>{email}</strong>. They can click the email link to join your workspace.</div>
                    </div>
                  </div>

                  {copyError && (
                    <div role="alert" className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{copyError}</span>
                    </div>
                  )}

                  <div>
                    <label htmlFor="invite-direct-link" className="block text-xs font-semibold text-ink mb-1.5">
                      Direct Invitation Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="invite-direct-link"
                        type="text"
                        readOnly
                        value={inviteUrl}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-offwhite text-xs font-mono text-slate truncate focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void copy(inviteUrl)}
                        className="min-w-6 min-h-6 px-3 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                        {copied ? "Copied" : "Copy Link"}
                      </button>
                      <span role="status" className="sr-only">
                        {statusMessage}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 bg-blue text-white text-xs font-semibold rounded-xl hover:bg-blue-mid transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}

                  {isAtLimit && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
                      Your plan has reached its team member limit ({currentMemberCount}/{memberLimit}).{" "}
                      <Link
                        href="/pricing"
                        onClick={handleClose}
                        className="font-semibold text-amber-900 underline hover:no-underline"
                      >
                        Upgrade your plan
                      </Link>{" "}
                      to invite more team members.
                    </div>
                  )}

                  <div>
                    <label htmlFor="invite-email" className="block text-xs font-semibold text-ink mb-1.5">
                      Email Address
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      required
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="colleague@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading || isAtLimit}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/30 disabled:opacity-50"
                    />
                  </div>

                  <fieldset disabled={loading || isAtLimit}>
                    <legend className="block text-xs font-semibold text-ink mb-1.5">
                      Role
                    </legend>
                    <div className="space-y-2">
                      {ROLES.map((r) => (
                        <label
                          key={r.value}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            role === r.value
                              ? "border-blue bg-blue-faint/50 ring-1 ring-blue"
                              : "border-border hover:border-slate/30 bg-white"
                          }`}
                        >
                          <input
                            type="radio"
                            name="role"
                            value={r.value}
                            checked={role === r.value}
                            onChange={(e) => setRole(e.target.value)}
                            className="mt-0.5 text-blue focus:ring-blue"
                          />
                          <div>
                            <div className="text-xs font-semibold text-ink">{r.label}</div>
                            <div className="text-[11px] text-muted">{r.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={loading}
                      className="px-4 py-2 text-xs font-medium text-slate hover:bg-offwhite rounded-xl transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || isAtLimit || !email.trim()}
                      className="px-4 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                      {loading ? "Sending Invite…" : "Send Invitation Email"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
