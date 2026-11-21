"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home, Copy, Check } from "lucide-react";
import { logger } from "@/lib/logger";
import { useClipboard } from "@/hooks/useClipboard";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { copied, copy } = useClipboard();

  useEffect(() => {
    logger.error("Unhandled client error caught by ErrorBoundary", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      role="alert"
      className="min-h-screen bg-offwhite flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full shadow-lg text-center space-y-6">
        <div
          aria-hidden="true"
          className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600"
        >
          <AlertTriangle className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-ink">Something went wrong</h1>
          <p className="text-sm text-slate leading-relaxed">
            An unexpected error occurred while loading this view. Our team has been notified.
          </p>
          {error.digest && (
            <div className="pt-1 flex items-center justify-center gap-2">
              <p className="text-xs font-mono text-slate bg-offwhite border border-border/80 px-3 py-1.5 rounded-lg inline-block">
                Error Digest: {error.digest}
              </p>
              <button
                type="button"
                onClick={() => void copy(error.digest ?? "")}
                className="min-w-8 min-h-8 inline-flex items-center justify-center rounded-lg border border-border bg-white text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
                aria-label={copied ? "Copied error digest" : "Copy error digest"}
                title={copied ? "Copied" : "Copy error digest"}
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm hover:bg-blue-mid transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 bg-offwhite text-ink border border-border px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-border/40 transition-colors"
          >
            <Home className="w-4 h-4 text-slate" aria-hidden="true" />
            Return Home
          </Link>
        </div>

        <p className="text-xs text-slate">
          Need help?{" "}
          <a
            href={`mailto:support@vision-board.tech${error.digest ? `?subject=${encodeURIComponent(`Error report (${error.digest})`)}` : ""}`}
            className="text-blue hover:underline font-medium"
          >
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}
