"use client";

/**
 * ApiKeysSection — API key management panel inside account settings.
 *
 * Allows users to generate long-lived API keys for MCP clients (Kiro, Claude,
 * Cursor, custom agents) and revoke existing keys. The raw key is shown once
 * immediately after creation and is never returned again.
 */

import { useState, useEffect } from "react";
import { Key, Copy, Check, Loader2, AlertCircle, Trash2, X, Plus, Eye } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── On mount: fetch existing keys ────────────────────────────────────────

  useEffect(() => {
    async function loadKeys() {
      try {
        const res = await fetch("/api/user/api-keys");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to load API keys.");
          return;
        }
        const data = await res.json();
        setKeys(data);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadKeys();
  }, []);

  // ── Create key handler ────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    setError(null);
    setIsCreating(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create API key.");
        return;
      }
      // Close create modal, open one-time key reveal modal
      setShowCreateModal(false);
      setNewKeyName("");
      setRawKey(data.rawKey);
      // Prepend new key (without rawKey) to list
      const { rawKey: _raw, ...keyRow } = data;
      setKeys((prev) => [keyRow, ...prev]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  function handleCloseCreateModal() {
    setShowCreateModal(false);
    setNewKeyName("");
    setError(null);
  }

  function handleDismissRawKey() {
    setRawKey(null);
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────

  async function handleCopy() {
    if (!rawKey) return;
    try {
      await navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback — silently ignore clipboard errors
    }
  }

  // ── Revoke handler ────────────────────────────────────────────────────────

  async function handleRevoke() {
    if (!revokeTarget) return;
    setIsRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/api-keys/${revokeTarget}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to revoke key.");
        return;
      }
      setKeys((prev) => prev.filter((k) => k.id !== revokeTarget));
      setRevokeTarget(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsRevoking(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="bg-white rounded-2xl border border-border p-6">
      {/* ── Section header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-blue" />
          <h2 className="font-semibold text-ink">API Keys</h2>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setError(null); }}
          disabled={isCreating}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue hover:bg-blue-mid border border-transparent rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Plus size={13} />
          Generate New Key
        </button>
      </div>

      <p className="text-xs text-muted mb-5">
        Use API keys to connect AI agents and external tools to your VisionBoard workspace.
      </p>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-400 hover:text-red-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Loading state ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-xs">Loading keys…</span>
        </div>
      ) : keys.length === 0 ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-10 h-10 rounded-full bg-offwhite border border-border flex items-center justify-center mb-3">
            <Key size={18} className="text-muted" />
          </div>
          <p className="text-sm font-medium text-ink mb-1">No API keys yet</p>
          <p className="text-xs text-muted max-w-xs">
            Generate one to connect AI agents to your workspace.
          </p>
        </div>
      ) : (
        /* ── Key list ── */
        <div className="space-y-2">
          {keys.map((key) => {
            const isRevoked = key.revokedAt !== null;
            const isTargeted = revokeTarget === key.id;

            return (
              <div
                key={key.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border transition-colors ${
                  isRevoked
                    ? "bg-offwhite/60 border-border opacity-60"
                    : "bg-offwhite border-border hover:border-blue/30"
                }`}
              >
                {/* ── Key info ── */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-white border border-border px-2 py-0.5 rounded-lg text-ink">
                      {key.keyPrefix}…
                    </code>
                    <span className="text-sm font-medium text-ink truncate">{key.name}</span>
                    {isRevoked && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted flex-wrap">
                    <span>Created {formatDate(key.createdAt)}</span>
                    <span className="text-border">·</span>
                    <span>
                      Last used:{" "}
                      {key.lastUsedAt ? relativeTime(key.lastUsedAt) : "Never"}
                    </span>
                  </div>
                </div>

                {/* ── Revoke controls ── */}
                {!isRevoked && (
                  <div className="shrink-0">
                    {isTargeted ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate font-medium">Revoke this key?</span>
                        <button
                          onClick={handleRevoke}
                          disabled={isRevoking}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isRevoking ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Trash2 size={11} />
                          )}
                          {isRevoking ? "Revoking…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setRevokeTarget(null)}
                          disabled={isRevoking}
                          className="px-3 py-1.5 text-xs font-semibold text-slate hover:text-ink hover:bg-white rounded-lg border border-border transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRevokeTarget(key.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-lg border border-border transition-colors"
                      >
                        <Trash2 size={12} />
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create key modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-blue" />
                <h3 className="font-bold text-ink">Generate API Key</h3>
              </div>
              <button
                onClick={handleCloseCreateModal}
                className="text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  Key Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={64}
                  placeholder="e.g. My Codex Agent"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink bg-white placeholder:text-muted focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue"
                />
                <p className="text-[11px] text-muted mt-1">
                  Give this key a recognizable name (max 64 characters).
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  disabled={isCreating}
                  className="px-4 py-2 text-xs font-medium text-slate hover:bg-offwhite rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newKeyName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50"
                >
                  {isCreating && <Loader2 size={13} className="animate-spin" />}
                  {isCreating ? "Generating…" : "Generate Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── One-time key reveal modal ── */}
      {rawKey && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-blue" />
                <h3 className="font-bold text-ink">Your New API Key</h3>
              </div>
              <button
                onClick={handleDismissRawKey}
                className="text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Warning notice */}
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <strong>⚠️ This key will not be shown again.</strong> Copy it now and store it
                  somewhere safe.
                </span>
              </div>

              {/* Raw key display */}
              <div>
                <label className="block text-xs font-semibold text-ink mb-1.5">
                  API Key
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 block text-xs font-mono bg-offwhite border border-border px-3 py-2.5 rounded-xl text-ink break-all select-all">
                    {rawKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                      copied
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-border text-slate hover:text-ink hover:bg-offwhite"
                    }`}
                  >
                    {copied ? (
                      <Check size={13} />
                    ) : (
                      <Copy size={13} />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="pt-1 text-right">
                <button
                  onClick={handleDismissRawKey}
                  className="px-5 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
