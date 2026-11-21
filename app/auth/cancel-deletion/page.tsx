"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";

function CancelDeletionContent() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const [email, setEmail] = useState(() => emailParam);
  const [loading, setLoading] = useState(Boolean(tokenParam));
  const [restored, setRestored] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const submittedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [emailParam, email]);

  useEffect(() => {
    if (!tokenParam || submittedTokenRef.current === tokenParam) return;
    submittedTokenRef.current = tokenParam;

    async function verifyAndRestore(token: string) {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/user/cancel-deletion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error ?? "This restoration link is invalid or has expired.");
          return;
        }

        setRestored(true);
        setStatusMessage(
          data.message ??
            "Your account deletion request has been cancelled. Your data and workspaces are safe."
        );
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    verifyAndRestore(tokenParam);
  }, [tokenParam]);

  async function handleSendRestorationLink(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError("");
    setLinkSent(false);

    try {
      const res = await fetch("/api/user/cancel-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend", email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? data.message ?? "Failed to send restoration link.");
        return;
      }

      setLinkSent(true);
      setStatusMessage(
        data.message ??
          "If an account with that email is scheduled for deletion, we've sent a secure restoration link to your inbox."
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border shadow-xl w-full max-w-md p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue flex items-center justify-center mx-auto mb-4">
          <ShieldCheck size={24} aria-hidden="true" />
        </div>

        <h1 className="font-bold text-ink text-xl mb-2">Restore Your Account</h1>

        {tokenParam && loading && !restored && !error ? (
          <div className="py-6 flex flex-col items-center gap-3">
            <Loader2 size={22} className="animate-spin text-blue" aria-hidden="true" />
            <p className="text-sm text-slate">Verifying your restoration link…</p>
          </div>
        ) : restored ? (
          <div className="space-y-4">
            <div role="status" className="flex items-center justify-center gap-2 text-emerald-600 font-semibold text-sm">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>Account Reactivated Successfully!</span>
            </div>
            <p className="text-xs text-slate leading-relaxed">
              {statusMessage || "Your account deletion request has been cancelled. Your data and workspaces are safe."}
            </p>
            <div className="pt-4">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 bg-blue hover:bg-blue-mid text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Sign In to Your Account
              </Link>
            </div>
          </div>
        ) : linkSent ? (
          <div className="space-y-4">
            <div role="status" className="flex items-center justify-center gap-2 text-emerald-600 font-semibold text-sm">
              <Mail size={18} aria-hidden="true" />
              <span>Check Your Email</span>
            </div>
            <p className="text-xs text-slate leading-relaxed">{statusMessage}</p>
            <div className="pt-3 flex flex-col gap-2">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 bg-blue hover:bg-blue-mid text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Back to Sign In
              </Link>
              <button
                type="button"
                onClick={() => setLinkSent(false)}
                className="text-xs text-slate hover:text-ink underline cursor-pointer py-1"
              >
                Send to a different email
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSendRestorationLink}
            className="space-y-4 text-left pt-2"
          >
            <p className="text-xs text-slate text-center leading-relaxed">
              For your security, cancelling account deletion requires a signed restoration link sent to your email address.
            </p>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="cancel-email" className="block text-xs font-semibold text-ink mb-1.5">
                Account email
              </label>
              <input
                id="cancel-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/30"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue hover:bg-blue-mid disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              {loading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              {loading ? "Sending restoration link…" : "Send restoration link"}
            </button>

            <div className="text-center pt-1">
              <Link href="/auth/login" className="text-xs text-slate hover:text-ink hover:underline">
                ← Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function CancelDeletionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-offwhite flex items-center justify-center gap-2 text-sm text-slate">
          <Loader2 size={16} className="animate-spin text-blue" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      }
    >
      <CancelDeletionContent />
    </Suspense>
  );
}
