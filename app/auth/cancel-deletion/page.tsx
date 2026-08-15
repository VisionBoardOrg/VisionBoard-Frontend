"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

function CancelDeletionContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const emailParam = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailParam);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
      handleCancel(emailParam);
    }
  }, [emailParam]);

  async function handleCancel(targetEmail: string) {
    if (!targetEmail) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/user/cancel-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to cancel account deletion.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={24} />
        </div>

        <h1 className="font-bold text-ink text-xl mb-2">Cancel Account Deletion</h1>

        {success ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 text-emerald-600 font-semibold text-sm">
              <CheckCircle2 size={18} />
              <span>Account Reactivated Successfully!</span>
            </div>
            <p className="text-xs text-muted">
              Your account deletion request has been cancelled. Your data and workspaces are safe.
            </p>
            <div className="pt-4">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                Sign In to Your Account
              </Link>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCancel(email);
            }}
            className="space-y-4 text-left pt-2"
          >
            <p className="text-xs text-slate text-center">
              Enter your account email address below to cancel scheduled deletion and restore full account access.
            </p>

            {error && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Account Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? "Reactivating Account…" : "Cancel Deletion & Restore Account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function CancelDeletionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
      <CancelDeletionContent />
    </Suspense>
  );
}
