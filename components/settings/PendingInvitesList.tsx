"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Trash2, Copy, Check, Clock } from "lucide-react";

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
}

export function PendingInvitesList({ workspaceId, invites }: PendingInvitesListProps) {
  const router = useRouter();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (invites.length === 0) return null;

  async function handleCancel(inviteId: string) {
    setCancellingId(inviteId);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members?inviteId=${inviteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (err) {
      console.error("[handleCancel]", err);
    } finally {
      setCancellingId(null);
    }
  }

  function handleCopy(invite: PendingInvite) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/invite/${invite.token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="mt-6 pt-5 border-t border-border space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={15} className="text-amber-500" />
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Pending Invitations ({invites.length})</h3>
      </div>

      <div className="space-y-2">
        {invites.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-200/60 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <Mail size={14} />
              </div>
              <div>
                <div className="font-semibold text-ink">{inv.email}</div>
                <div className="text-[11px] text-muted capitalize">Role: {inv.role} • Invited link sent</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                Pending Email
              </span>
              <button
                onClick={() => handleCopy(inv)}
                title="Copy Invite Link"
                className="p-1.5 rounded-lg text-slate hover:text-blue hover:bg-white transition-colors"
              >
                {copiedId === inv.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
              <button
                onClick={() => handleCancel(inv.id)}
                disabled={cancellingId === inv.id}
                title="Cancel Invitation"
                className="p-1.5 rounded-lg text-slate hover:text-red-600 hover:bg-white transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
