"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Mail, AlertTriangle, CheckCircle2, Loader2, X, RefreshCw } from "lucide-react";

function EmailVerificationBannerInner() {
  const { data: session, update: updateSession } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const verifiedParam = searchParams.get("verified");
  const reasonParam = searchParams.get("reason");

  useEffect(() => {
    if (verifiedParam === "true") {
      updateSession();
      setStatusMessage({
        type: "success",
        text: "Your email address has been successfully verified.",
      });
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

  // Always honor manual dismissal first, even when a status message is active
  if (dismissed) return null;

  if (!session?.user || session.user.emailVerified) {
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
          text: data.message || "Verification link sent to your inbox.",
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
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs sm:text-sm text-amber-950">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
          {statusMessage?.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          ) : statusMessage?.type === "error" ? (
            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          ) : (
            <Mail className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          )}
          <span className="leading-snug break-words" aria-live="polite">
            {statusMessage ? (
              <strong
                className={
                  statusMessage.type === "success"
                    ? "text-emerald-900 font-medium"
                    : "text-rose-800 font-medium"
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

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {!session?.user?.emailVerified && (
            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-medium text-xs rounded-lg transition-colors shadow-sm disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" aria-hidden="true" />
                  <span>Resend Verification Email</span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-w-8 min-h-8 flex items-center justify-center text-amber-800 hover:text-amber-950 rounded-md hover:bg-amber-100 transition-colors cursor-pointer"
            aria-label="Dismiss banner"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Public export — self-wraps the banner in <Suspense> because it internally
 * calls `useSearchParams()` which Next.js requires to be behind a Suspense
 * boundary during static prerender analysis.
 */
export function EmailVerificationBanner() {
  return (
    <Suspense fallback={null}>
      <EmailVerificationBannerInner />
    </Suspense>
  );
}
