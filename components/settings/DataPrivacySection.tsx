"use client";

/**
 * DataPrivacySection — account data rights panel.
 *
 * Provides:
 *   1. Personal data download (GET /api/user/data-export)
 *   2. Workspace data export (GET /api/workspaces/[id]/export)
 *   3. Account deletion with 30-day retention and email confirmation
 */

import { useState } from "react";
import { Download, Trash2, ShieldCheck, AlertCircle, Loader2, X } from "lucide-react";

interface DataPrivacySectionProps {
  userEmail: string;
}

export function DataPrivacySection({ userEmail }: DataPrivacySectionProps) {
  const [deleteOpen,    setDeleteOpen]    = useState(false);
  const [confirmEmail,  setConfirmEmail]  = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [exportLoading, setExportLoading] = useState<"personal" | null>(null);

  // ── Data downloads ──────────────────────────────────────────────────────

  async function handleDownload(type: "personal") {
    setExportLoading(type);
    try {
      const url = "/api/user/data-export";

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Export failed. Please try again.");
        return;
      }

      // Trigger browser download
      const blob     = await res.blob();
      const filename = res.headers
        .get("Content-Disposition")
        ?.match(/filename="(.+?)"/)?.[1] ?? `visionboard-export.json`;
      const link = document.createElement("a");
      link.href  = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setExportLoading(null);
    }
  }

  // ── Account deletion ────────────────────────────────────────────────────

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleteError("");
    setDeleteLoading(true);

    try {
      const res = await fetch("/api/user/delete", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ confirmEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Deletion request failed.");
        return;
      }
      setDeleteSuccess(true);
      // Redirect to login after 3 seconds — session has been invalidated
      setTimeout(() => {
        window.location.href = "/auth/login?message=account-deleted";
      }, 3000);
    } catch {
      setDeleteError("Network error. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-border p-6">
      <div className="flex items-center gap-2 mb-5">
        <ShieldCheck size={18} className="text-blue" />
        <h2 className="font-semibold text-ink">Data &amp; Privacy</h2>
      </div>

      <div className="space-y-4">

        {/* ── Personal data download ── */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-offwhite border border-border">
          <div>
            <p className="text-sm font-semibold text-ink">Download your personal data</p>
            <p className="text-xs text-muted mt-0.5">
              A JSON file containing your profile, workspace memberships, comments, and AI usage history.
            </p>
          </div>
          <button
            onClick={() => handleDownload("personal")}
            disabled={exportLoading !== null}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-border text-ink hover:bg-white transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
          >
            {exportLoading === "personal"
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />}
            {exportLoading === "personal" ? "Exporting…" : "Download"}
          </button>
        </div>


        {/* ── Account deletion ── */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-red-50 border border-red-200">
          <div>
            <p className="text-sm font-semibold text-red-700">Delete account</p>
            <p className="text-xs text-red-600 mt-0.5">
              Your account will be scheduled for permanent deletion in 30 days. You'll be signed out immediately.
              Export your data first.
            </p>
          </div>
          <button
            onClick={() => { setDeleteOpen(true); setDeleteError(""); setConfirmEmail(""); }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors shrink-0"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden">
            {deleteSuccess ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={22} />
                </div>
                <h3 className="font-bold text-ink text-lg mb-2">Account deletion scheduled</h3>
                <p className="text-sm text-muted">
                  Your data will be permanently deleted in 30 days. You've been signed out. Redirecting…
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <h3 className="font-bold text-ink">Confirm account deletion</h3>
                  <button
                    onClick={() => setDeleteOpen(false)}
                    className="text-slate hover:text-ink p-1 rounded-lg hover:bg-offwhite transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleDelete} className="p-6 space-y-4">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600" />
                    <div>
                      <strong>This action is irreversible after 30 days.</strong> Your account, workspaces you own, and all associated data will be permanently deleted. Export your data before proceeding.
                    </div>
                  </div>

                  {deleteError && (
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>{deleteError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-ink mb-1.5">
                      Type your email address to confirm
                    </label>
                    <input
                      type="email"
                      required
                      value={confirmEmail}
                      onChange={(e) => setConfirmEmail(e.target.value)}
                      placeholder={userEmail}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-red-300 text-sm text-ink placeholder:text-muted focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setDeleteOpen(false)}
                      disabled={deleteLoading}
                      className="px-4 py-2 text-xs font-medium text-slate hover:bg-offwhite rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={deleteLoading || confirmEmail.toLowerCase() !== userEmail.toLowerCase()}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {deleteLoading && <Loader2 size={13} className="animate-spin" />}
                      {deleteLoading ? "Processing…" : "Delete my account"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
