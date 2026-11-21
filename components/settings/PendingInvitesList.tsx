"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, Copy, Check, Clock, Loader2, AlertCircle } from "lucide-react";
import { useConfirm } from "@/context/ConfirmContext";
import { useClipboard } from "@/hooks/useClipboard";
import { formatRoleLabel } from "@/lib/roles";

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  createdAt: string | Date;
}

interface PendingInvitesListProps {
  workspaceId: string;
  invites: PendingInvite[];
  canManage?: boolean;
}

export function PendingInvitesList({
  workspaceId,
  invites,
  canManage = true,
}: PendingInvitesListProps) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { copiedKey, copyError, copy } = useClipboard();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (invites.length === 0) return null;

  async function handleCancel(invite: PendingInvite) {
    const ok = await confirm({
      title: "Cancel invitation?",
      description: `Revoke the pending invitation sent to ${invite.email}? Their existing invite link will stop working immediately.`,
      confirmLabel: "Cancel invitation",
      danger: true,
    });
    if (!ok) return;

    setCancellingId(invite.id);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members?inviteId=${encodeURIComponent(invite.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to cancel invitation.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while cancelling invitation. Please try again.");
    } finally {
      setCancellingId(null);
    }
  }

  function handleCopy(invite: PendingInvite) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/invite/${invite.token}`;
    void copy(inviteUrl, invite.id);
  }

  const displayedError = error || copyError;

  return (
    <div className="mt-6 pt-5 border-t border-border space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={15} className="text-amber-500" aria-hidden="true" />
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Pending Invitations ({invites.length})</h3>
      </div>

      {displayedError && (
        <div role="alert" className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{displayedError}</span>
        </div>
      )}

      <div className="space-y-2">
        {invites.map((inv) => (
          <div
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-amber-50/50 border border-amber-200/60 text-xs"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0">
                <Mail size={14} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">{inv.email}</div>
                <div className="text-[11px] text-muted truncate">
                  Role: {formatRoleLabel(inv.role)} · Invite link sent
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                Pending
              </span>
              {canManage && (
                <>
                  <button
                    type="button"
                    onClick={() => handleCopy(inv)}
                    title="Copy invite link"
                    aria-label={`Copy invite link for ${inv.email}`}
                    className="p-1.5 rounded-lg text-slate hover:text-blue hover:bg-white transition-colors cursor-pointer"
                  >
                    {copiedKey === inv.id
                      ? <Check size={14} className="text-emerald-600" aria-hidden="true" />
                      : <Copy size={14} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancel(inv)}
                    disabled={cancellingId === inv.id}
                    title="Cancel invitation"
                    aria-label={`Cancel invitation for ${inv.email}`}
                    className="p-1.5 rounded-lg text-slate hover:text-red-600 hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {cancellingId === inv.id
                      ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      : <Trash2 size={14} aria-hidden="true" />}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
