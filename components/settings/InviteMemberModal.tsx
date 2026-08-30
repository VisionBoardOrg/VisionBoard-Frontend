"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Loader2, CheckCircle2, AlertCircle, Copy, Check } from "lucide-react";

interface InviteMemberModalProps {
  workspaceId: string;
  currentMemberCount: number;
  memberLimit: number | null;
}

const ROLES = [
  { value: "pm", label: "Product Manager", description: "Manage goals, roadmaps & board" },
  { value: "exec", label: "Executive / Strategy", description: "Executive rollup & health view" },
  { value: "eng", label: "Engineering / Ops", description: "Sprint tracking & blockers" },
  { value: "marketing", label: "Marketing / Growth", description: "Campaigns & timelines" },
  { value: "admin", label: "Admin", description: "Full workspace & settings access" },
];

export function InviteMemberModal({ workspaceId, currentMemberCount, memberLimit }: InviteMemberModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("pm");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const isAtLimit = typeof memberLimit === "number" && currentMemberCount >= memberLimit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");
    setInviteUrl("");
    setCopied(false);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();

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

  function handleCopy() {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setIsOpen(false);
    setEmail("");
    setRole("pm");
    setError("");
    setInviteUrl("");
  }

  return (
    <>
      <button
        onClick={() => {
          setError("");
          setInviteUrl("");
          setIsOpen(true);
        }}
        className="mt-4 w-full border border-dashed border-border text-sm text-muted hover:border-blue/40 hover:text-blue py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 font-medium"
      >
        <UserPlus size={16} />
        + Invite team member
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-faint text-blue">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-ink text-base">Invite Team Member</h3>
                  <p className="text-xs text-muted">Send an email invitation to your workspace.</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {inviteUrl ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
                    <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                    <div>
                      <div className="font-semibold">Invitation Email Sent!</div>
                      <div>An invitation link was dispatched to <strong>{email}</strong>. They can click the email link to join your workspace.</div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">
                      Direct Invitation Link
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-offwhite text-xs font-mono text-slate truncate focus:outline-none"
                      />
                      <button
                        onClick={handleCopy}
                        className="px-3 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors flex items-center gap-1.5 shrink-0"
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? "Copied" : "Copy Link"}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-blue text-white text-xs font-semibold rounded-xl hover:bg-blue-mid transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {isAtLimit && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                      Your plan has reached its team member limit ({currentMemberCount}/{memberLimit}). Upgrade your plan to invite more team members.
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="colleague@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading || isAtLimit}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">
                      Role
                    </label>
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
                            disabled={loading || isAtLimit}
                            className="mt-0.5 text-blue focus:ring-blue"
                          />
                          <div>
                            <div className="text-xs font-semibold text-ink">{r.label}</div>
                            <div className="text-[11px] text-muted">{r.description}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={loading}
                      className="px-4 py-2 text-xs font-medium text-slate hover:bg-offwhite rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || isAtLimit || !email.trim()}
                      className="px-4 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {loading && <Loader2 size={14} className="animate-spin" />}
                      {loading ? "Sending Invite..." : "Send Invitation Email"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
