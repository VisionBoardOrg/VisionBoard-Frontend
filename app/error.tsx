"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { logger } from "@/lib/logger";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled client error caught by ErrorBoundary", error, {
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full shadow-lg text-center space-y-6">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-ink">Something went wrong</h2>
          <p className="text-sm text-slate">
            An unexpected error occurred while loading this view. Our team has been notified.
          </p>
          {error.digest && (
            <p className="text-[11px] font-mono text-slate-400 bg-offwhite px-3 py-1 rounded-lg inline-block">
              Error Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl font-semibold text-xs shadow-sm hover:bg-blue-mid transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 bg-offwhite text-ink border border-border px-5 py-2.5 rounded-xl font-semibold text-xs hover:bg-border/40 transition-colors"
          >
            <Home className="w-4 h-4 text-slate" />
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
