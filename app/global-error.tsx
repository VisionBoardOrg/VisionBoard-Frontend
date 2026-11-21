"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-offwhite text-ink flex items-center justify-center p-4 font-sans">
        <main
          role="alert"
          className="bg-white rounded-2xl border border-border p-8 max-w-md w-full shadow-lg text-center space-y-6"
        >
          <div
            aria-hidden="true"
            className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto"
          >
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-ink">Critical Application Error</h1>
            <p className="text-sm text-slate leading-relaxed">
              A major system error prevented the page from rendering properly.
            </p>
            {error.digest && (
              <p className="text-xs font-mono text-slate bg-offwhite border border-border/80 px-3 py-1.5 rounded-lg inline-block">
                Error Digest: {error.digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="bg-blue hover:bg-blue-mid text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
            >
              Reload Application
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              className="bg-offwhite hover:bg-border/40 text-ink border border-border px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
            >
              Go to Home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
