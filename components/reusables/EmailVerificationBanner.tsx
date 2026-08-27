"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, AlertTriangle, CheckCircle2, Loader2, X, RefreshCw } from "lucide-react";

export function EmailVerificationBanner() {
  const { data: session, update: updateSession } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const verifiedParam = searchParams.get("verified");
  const reasonParam = searchParams.get("reason");

  // If redirected with ?verified=true, trigger session update so emailVerified updates locally
  useEffect(() => {
    if (verifiedParam === "true") {
      updateSession();
      setStatusMessage({
        type: "success",
        text: "Your email address has been successfully verified! 🎉",
      });
      // Clean up URL query params after 4 seconds
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("verified");
        url.searchParams.delete("reason");
        router.replace(url.pathname + url.search);
      }, 4000);
      return () => clearTimeout(timer);
    } else if (verifiedParam === "error") {
      const msg =
        reasonParam === "expired"
          ? "Verification link has expired. Please request a new link below."
          : "Invalid verification link.";
      setStatusMessage({ type: "error", text: msg });
    }
  }, [verifiedParam, reasonParam, updateSession, router]);

  // Do not render banner if user is unauthenticated, verified, or user dismissed it
  if (!session?.user || session.user.emailVerified || dismissed) {
    if (!statusMessage) return null;
  }

  async function handleResend() {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/auth/verify-email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({
          type: "error",
          text: data.error || "Failed to send verification email.",
        });
      } else {
        setStatusMessage({
          type: "success",
          text: data.message || "Verification link sent to your inbox!",
        });
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Network error while requesting verification email.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full bg-amber-50/90 dark:bg-amber-950/30 border-b border-amber-200/80 dark:border-amber-900/50 px-4 py-2.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
        <div className="flex items-center gap-2.5 min-w-0">
          {statusMessage?.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : statusMessage?.type === "error" ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
          ) : (
            <Mail className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <span className="truncate">
            {statusMessage ? (
              <strong
                className={
                  statusMessage.type === "success"
                    ? "text-emerald-800 dark:text-emerald-300 font-medium"
                    : "text-rose-800 dark:text-rose-300 font-medium"
                }
              >
                {statusMessage.text}
              </strong>
            ) : (
              <>
                Please verify your email (<strong>{session?.user.email}</strong>) to secure your account.
              </>
            )}
          </span>
        </div>

        {!session?.user.emailVerified && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleResend}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs rounded-lg transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" />
                  <span>Resend Verification Email</span>
                </>
              )}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 rounded-md hover:bg-amber-100/60 dark:hover:bg-amber-900/50 transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
