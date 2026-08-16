"use client";

import { useState, useEffect } from "react";
import { Link2, Copy, Check, RefreshCw, Trash2, Loader2, AlertCircle } from "lucide-react";

interface InviteLinkSectionProps {
  workspaceId: string;
  initialToken: string | null;
  canManage: boolean;
  canAdmin: boolean;
}

export function InviteLinkSection({
  workspaceId,
  initialToken,
  canManage,
  canAdmin,
}: InviteLinkSectionProps) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState<"generate" | "regenerate" | "revoke" | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const inviteUrl = token ? (origin ? `${origin}/invite/${token}` : `/invite/${token}`) : null;

  async function handleGenerate() {
    setLoading("generate");
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invite-link`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to generate link."); return; }
      setToken(data.token);
    } finally {
      setLoading(null);
    }
  }

  async function handleRegenerate() {
    if (!confirm("Regenerate the invite link? The old link will stop working immediately.")) return;
    setLoading("regenerate");
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invite-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to regenerate link."); return; }
      setToken(data.token);
    } finally {
      setLoading(null);
    }
  }

  async function handleRevoke() {
    if (!confirm("Disable the invite link? Anyone with the old link won't be able to join.")) return;
    setLoading("revoke");
    setError("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invite-link`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Failed to revoke link."); return; }
      setToken(null);
    } finally {
      setLoading(null);
    }
  }

  function handleCopy() {
    if (!token) return;
    const fullUrl = origin
      ? `${origin}/invite/${token}`
      : typeof window !== "undefined"
      ? `${window.location.origin}/invite/${token}`
      : `/invite/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink">Invite link</p>
          <p className="text-xs text-muted mt-0.5">
            Anyone with this link can join the workspace as a member.
          </p>
        </div>
        {token && canAdmin && (
          <button
            onClick={handleRevoke}
            disabled={loading === "revoke"}
            title="Disable invite link"
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            {loading === "revoke"
              ? <Loader2 size={13} className="animate-spin" />
              : <Trash2 size={13} />}
            Disable
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
          <AlertCircle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {token ? (
        <div className="space-y-2">
          {/* Link display + copy */}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 bg-offwhite border border-border rounded-xl px-3 py-2.5 min-w-0">
              <Link2 size={14} className="text-muted shrink-0" />
              <span className="text-xs font-mono text-slate truncate">{inviteUrl}</span>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2.5 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors shrink-0"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Regenerate — admin/owner only */}
          {canAdmin && (
            <button
              onClick={handleRegenerate}
              disabled={loading === "regenerate"}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              {loading === "regenerate"
                ? <Loader2 size={13} className="animate-spin" />
                : <RefreshCw size={13} />}
              Regenerate link
            </button>
          )}
        </div>
      ) : canManage ? (
        <button
          onClick={handleGenerate}
          disabled={loading === "generate"}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-border text-sm text-muted hover:border-blue/40 hover:text-blue py-2.5 rounded-xl transition-colors font-medium disabled:opacity-50"
        >
          {loading === "generate"
            ? <Loader2 size={15} className="animate-spin" />
            : <Link2 size={15} />}
          Generate invite link
        </button>
      ) : (
        <p className="text-xs text-muted">Only admins and product managers can create invite links.</p>
      )}
    </div>
  );
}
