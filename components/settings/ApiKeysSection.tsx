"use client";

/**
 * ApiKeysSection — API key management panel inside account settings.
 *
 * Allows users to generate long-lived API keys for MCP clients (Kiro, Claude,
 * Cursor, custom agents) and revoke existing keys. The raw key is shown once
 * immediately after creation and is never returned again.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Key, Copy, Check, Loader2, AlertCircle, Trash2, X, Plus, Eye, Calendar, Clock, RefreshCw } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useClipboard } from "@/hooks/useClipboard";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  keySuffix: string;
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
  const g = globalThis as unknown as {
    Temporal?: {
      Now: { instant(): { since(other: unknown, opts: { largestUnit: string }): { hours: number; minutes: number; seconds: number } } };
      Instant: { from(s: string): unknown };
    };
    Intl?: typeof Intl & {
      DurationFormat?: new (
        locales?: string | string[],
        options?: { style?: "long" | "short" | "narrow" }
      ) => { format(duration: { days?: number; hours?: number; minutes?: number }): string };
    };
  };

  let totalMinutes = 0;
  if (g.Temporal) {
    try {
      const dur = g.Temporal.Now.instant().since(g.Temporal.Instant.from(dateStr), {
        largestUnit: "hours",
      });
      totalMinutes = Math.max(0, dur.hours * 60 + dur.minutes);
    } catch {
      const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
      totalMinutes = Math.floor(diff / 60000);
    }
  } else {
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    totalMinutes = Math.floor(diff / 60000);
  }

  if (totalMinutes < 1) return "Just now";
  const DurationFormatCtor = g.Intl?.DurationFormat;
  if (totalMinutes < 60) {
    if (DurationFormatCtor) {
      return `${new DurationFormatCtor("en", { style: "long" }).format({ minutes: totalMinutes })} ago`;
    }
    return `${totalMinutes} minute${totalMinutes !== 1 ? "s" : ""} ago`;
  }
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 24) {
    if (DurationFormatCtor) {
      return `${new DurationFormatCtor("en", { style: "long" }).format({ hours })} ago`;
    }
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(hours / 24);
  if (DurationFormatCtor) {
    return `${new DurationFormatCtor("en", { style: "long" }).format({ days })} ago`;
  }
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

function formatMaskedKey(prefix: string, suffix: string): string {
  if (suffix) {
    return `${prefix}\u2022\u2022\u2022\u2022${suffix}`;
  }
  return `${prefix}\u2026`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ApiKeysSection() {
  const createModalRef = useRef<HTMLDialogElement>(null);
  const revealModalRef = useRef<HTMLDialogElement>(null);
  const { copied, copyError, statusMessage, copy } = useClipboard();

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [hasSavedRawKey, setHasSavedRawKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const loadKeys = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/user/api-keys");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error ?? "Failed to load API keys.");
        return;
      }
      const data = await res.json();
      setKeys(data);
    } catch {
      setLoadError("Network error while loading API keys. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCloseCreateModal = useCallback(() => {
    if (isCreating) return;
    setShowCreateModal(false);
    setNewKeyName("");
    setError(null);
  }, [isCreating]);

  const handleDismissRawKey = useCallback(() => {
    setRawKey(null);
    setHasSavedRawKey(false);
  }, []);

  useModalA11y(createModalRef, handleCloseCreateModal, showCreateModal);
  useModalA11y(revealModalRef, handleDismissRawKey, Boolean(rawKey));

  // ── Create key handler ────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim() || isCreating) return;

    setError(null);
    setIsCreating(true);
    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create API key.");
        return;
      }
      setShowCreateModal(false);
      setNewKeyName("");
      setHasSavedRawKey(false);
      setRawKey(data.rawKey);
      const { rawKey: _raw, ...keyRow } = data;
      void _raw;
      setKeys((prev) => [keyRow, ...prev]);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────

  async function handleCopy() {
    if (!rawKey) return;
    const ok = await copy(rawKey);
    if (ok) {
      setHasSavedRawKey(true);
    }
  }

  // ── Revoke handler ────────────────────────────────────────────────────────

  async function handleRevoke() {
    if (!revokeTarget || isRevoking) return;
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Key size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">API Keys</h2>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreateModal(true); setError(null); }}
          disabled={isCreating}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue hover:bg-blue-mid border border-transparent rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Plus size={13} aria-hidden="true" />
          Generate New Key
        </button>
      </div>

      <p className="text-xs text-muted mb-5">
        Use API keys to connect AI agents and external tools to your VisionBoard workspace.
      </p>

      {/* ── Action error banner ── */}
      {error && !showCreateModal && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">{error}</div>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="ml-2 text-red-400 hover:text-red-700 cursor-pointer"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* ── Loading / Load Error / Empty / List ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted">
          <Loader2 size={20} className="animate-spin mr-2" aria-hidden="true" />
          <span className="text-xs">Loading keys…</span>
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 px-4 py-2.5 rounded-xl">
            <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={loadKeys}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-border text-ink hover:bg-offwhite transition-colors cursor-pointer"
          >
            <RefreshCw size={13} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-10 h-10 rounded-full bg-offwhite border border-border flex items-center justify-center mb-3">
            <Key size={18} className="text-muted" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-ink mb-1">No API keys yet</p>
          <p className="text-xs text-muted max-w-xs">
            Generate one to connect AI agents to your workspace.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => {
            const isRevoked = key.revokedAt != null;
            const isTargeted = revokeTarget === key.id;

            return (
              <div
                key={key.id}
                className={`group rounded-2xl border transition-all duration-200 ${
                  isRevoked
                    ? "bg-slate-50/50 border-slate-200 opacity-70"
                    : "bg-white border-slate-200 hover:border-blue/40 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_16px_-6px_rgba(59,130,246,0.15)]"
                }`}
              >
                <div className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-ink tracking-tight">
                          {key.name}
                        </h3>
                        {isRevoked && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200">
                            Revoked
                          </span>
                        )}
                      </div>

                      <div className="inline-flex items-center max-w-full">
                        <div className="inline-flex items-center bg-gradient-to-r from-slate-50 to-slate-100/80 border border-slate-200 rounded-xl px-3 py-1.5 group-hover:from-blue-50/40 group-hover:to-indigo-50/40 group-hover:border-blue-200/60 transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2.5 shrink-0 ring-2 ring-emerald-500/15" aria-hidden="true" />
                          <code className="text-[12.5px] font-mono text-slate-700 tracking-wide truncate">
                            {formatMaskedKey(key.keyPrefix, key.keySuffix)}
                          </code>
                        </div>
                      </div>

                      <div className="flex items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted flex-wrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar size={12.5} className="text-slate-400 shrink-0" aria-hidden="true" />
                          <span>Created {formatDate(key.createdAt)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={12.5} className="text-slate-400 shrink-0" aria-hidden="true" />
                          <span>
                            Last used:&nbsp;
                            <span className={key.lastUsedAt ? "text-slate-600 font-medium" : ""}>
                              {key.lastUsedAt ? relativeTime(key.lastUsedAt) : "Never"}
                            </span>
                          </span>
                        </span>
                      </div>
                    </div>

                    {!isRevoked && (
                      <div className="shrink-0 sm:pt-0.5">
                        {isTargeted ? (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                            <span className="text-xs text-slate-600 font-medium text-right sm:text-left">
                              Revoke this key?
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleRevoke}
                                disabled={isRevoking}
                                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
                              >
                                {isRevoking ? (
                                  <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                                ) : (
                                  <Trash2 size={11} aria-hidden="true" />
                                )}
                                {isRevoking ? "Revoking…" : "Confirm"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setRevokeTarget(null)}
                                disabled={isRevoking}
                                className="px-3.5 py-2 text-xs font-semibold text-slate hover:text-ink hover:bg-slate-50 rounded-xl border border-slate-200 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRevokeTarget(key.id)}
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                          >
                            <Trash2 size={12.5} aria-hidden="true" />
                            Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create key modal ── */}
      {showCreateModal && (
        <dialog
          ref={createModalRef}
          closedby="any"
          aria-labelledby="create-api-key-title"
          className="m-auto bg-white rounded-2xl border border-border shadow-2xl w-[calc(100%-2rem)] max-w-sm p-0 overflow-hidden backdrop:bg-black/40 backdrop:backdrop-blur-xs"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Key size={16} className="text-blue" aria-hidden="true" />
              <h1 id="create-api-key-title" className="font-bold text-ink text-base">Generate API Key</h1>
            </div>
            <button
              type="button"
              onClick={handleCloseCreateModal}
              aria-label="Close"
              className="min-w-7 min-h-7 flex items-center justify-center text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors cursor-pointer"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {error && (
                <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="api-key-name" className="block text-xs font-semibold text-ink mb-1.5">
                  Key Name
                </label>
                <input
                  id="api-key-name"
                  type="text"
                  autoFocus
                  required
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  maxLength={64}
                  placeholder="e.g. My Codex Agent"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink bg-white placeholder:text-muted focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/30"
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
                  className="px-4 py-2 text-xs font-medium text-slate hover:bg-offwhite rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !newKeyName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isCreating && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                  {isCreating ? "Generating…" : "Generate Key"}
                </button>
              </div>
            </form>
        </dialog>
      )}

      {/* ── One-time key reveal modal ── */}
      {rawKey && (
        <dialog
          ref={revealModalRef}
          closedby="none"
          aria-labelledby="reveal-api-key-title"
          className="m-auto bg-white rounded-2xl border border-border shadow-2xl w-[calc(100%-2rem)] max-w-md p-0 overflow-hidden backdrop:bg-black/40 backdrop:backdrop-blur-xs"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Eye size={16} className="text-blue" aria-hidden="true" />
              <h1 id="reveal-api-key-title" className="font-bold text-ink text-base">Your New API Key</h1>
            </div>
              <button
                type="button"
                onClick={handleDismissRawKey}
                aria-label="Close"
                className="min-w-7 min-h-7 flex items-center justify-center text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors cursor-pointer"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Warning notice */}
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                <span>
                  <strong>This key will not be shown again.</strong> Copy it now and store it
                  somewhere safe.
                </span>
              </div>

              {copyError && (
                <div role="alert" className="flex items-start gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{copyError}</span>
                </div>
              )}

              {/* Raw key display */}
              <div>
                <label htmlFor="api-key-reveal" className="block text-xs font-semibold text-ink mb-1.5">
                  API Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="api-key-reveal"
                    type="text"
                    readOnly
                    value={rawKey}
                    className="flex-1 block text-xs font-mono bg-offwhite border border-border px-3 py-2.5 rounded-xl text-ink select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy to clipboard"
                    aria-label="Copy API key"
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                      copied
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                        : "bg-white border-border text-slate hover:text-ink hover:bg-offwhite"
                    }`}
                  >
                    {copied ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <Copy size={13} aria-hidden="true" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <span role="status" className="sr-only">
                    {statusMessage}
                  </span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasSavedRawKey}
                  onChange={(e) => setHasSavedRawKey(e.target.checked)}
                  className="rounded border-border text-blue focus:ring-blue"
                />
                <span>I have saved this key in a safe place</span>
              </label>

              <div className="pt-1 text-right">
                <button
                  type="button"
                  onClick={handleDismissRawKey}
                  disabled={!hasSavedRawKey}
                  className="px-5 py-2 bg-blue text-white rounded-xl text-xs font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
        </dialog>
      )}
    </section>
  );
}
