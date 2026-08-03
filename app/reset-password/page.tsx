"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/reusables/Logo";
import { CheckCircle2, Loader2, ArrowLeft } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  // ── Request mode (no token) ──
  const [email, setEmail] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState("");

  // ── Reset mode (has token) ──
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState("");

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setRequestLoading(true);
    setRequestError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRequestError(data.error || "Something went wrong.");
      } else {
        setRequestSent(true);
      }
    } catch {
      setRequestError("Network error. Please try again.");
    } finally {
      setRequestLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setResetLoading(true);
    setResetError("");
    try {
      const res = await fetch("/api/auth/reset-password?action=reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || "Failed to reset password.");
      } else {
        setResetSuccess(true);
        setTimeout(() => router.push("/auth/login"), 2500);
      }
    } catch {
      setResetError("Network error. Please try again.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <Logo markSize={36} textSize={22} />
          </div>
          <h1 className="text-2xl font-bold text-ink">
            {token ? "Choose a new password" : "Forgot your password?"}
          </h1>
          <p className="text-slate text-sm mt-1">
            {token
              ? "Enter a new password for your account."
              : "We'll send a reset link to your inbox."}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          {/* ── REQUEST MODE ── */}
          {!token && (
            <>
              {requestSent ? (
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} className="text-success" />
                  </div>
                  <h2 className="font-semibold text-ink">Check your inbox</h2>
                  <p className="text-sm text-slate">
                    If <strong>{email}</strong> is registered, we sent a reset link. It expires in 1 hour.
                  </p>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-1.5 text-sm text-blue hover:underline font-medium"
                  >
                    <ArrowLeft size={14} /> Back to sign in
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleRequest} className="space-y-4">
                  {requestError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                      {requestError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">
                      Email address
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={requestLoading}
                    className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {requestLoading && <Loader2 size={14} className="animate-spin" />}
                    {requestLoading ? "Sending…" : "Send reset link"}
                  </button>
                </form>
              )}
            </>
          )}

          {/* ── RESET MODE ── */}
          {token && (
            <>
              {resetSuccess ? (
                <div className="text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} className="text-success" />
                  </div>
                  <h2 className="font-semibold text-ink">Password updated</h2>
                  <p className="text-sm text-slate">
                    Your password has been changed. Redirecting you to sign in…
                  </p>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                      {resetError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="password">
                      New password
                    </label>
                    <input
                      id="password"
                      type="password"
                      required
                      minLength={12}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                      placeholder="Minimum 12 characters, include a number or symbol"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="confirm">
                      Confirm new password
                    </label>
                    <input
                      id="confirm"
                      type="password"
                      required
                      minLength={12}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {resetLoading && <Loader2 size={14} className="animate-spin" />}
                    {resetLoading ? "Updating…" : "Update password"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {!requestSent && !resetSuccess && (
          <p className="text-center text-sm text-slate mt-6">
            Remember your password?{" "}
            <Link href="/auth/login" className="text-blue font-medium hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
