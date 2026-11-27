"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/reusables/Logo";
import { CheckCircle2, Check, Circle, Loader2, ArrowLeft, Eye, EyeOff } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

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
  const [isTokenError, setIsTokenError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const hasMinLength = password.length >= 12;
  const hasNumberOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password);
  const isPasswordValid = hasMinLength && hasNumberOrSymbol;
  const isConfirmValid = confirmPassword.length > 0 && password === confirmPassword;

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (requestLoading) return;
    setRequestLoading(true);
    setRequestError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
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
    if (resetLoading) return;
    setIsTokenError(false);

    if (!hasMinLength || !hasNumberOrSymbol) {
      setResetError("Password must be at least 12 characters and include a number or symbol.");
      return;
    }
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg: string = data.error || "Failed to reset password.";
        setResetError(msg);
        if (/token|expired|invalid|used/i.test(msg) || res.status === 400) {
          setIsTokenError(true);
        }
      } else {
        setResetSuccess(true);
        redirectTimerRef.current = setTimeout(() => router.push("/auth/login"), 2500);
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
                <div role="status" className="text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} className="text-success" aria-hidden="true" />
                  </div>
                  <h2 className="font-semibold text-ink">Check your inbox</h2>
                  <p className="text-sm text-slate">
                    If <strong>{email}</strong> is registered, we sent a reset link. It expires in 1 hour.
                  </p>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-1.5 text-sm text-blue hover:underline font-medium"
                  >
                    <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleRequest} className="space-y-4">
                  {requestError && (
                    <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
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
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid="false"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors user-invalid:border-danger"
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={requestLoading}
                    className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {requestLoading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
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
                <div role="status" className="text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} className="text-success" aria-hidden="true" />
                  </div>
                  <h2 className="font-semibold text-ink">Password updated</h2>
                  <p className="text-sm text-slate">
                    Your password has been changed. Redirecting you to sign in…
                  </p>
                  <Link
                    href="/auth/login"
                    className="inline-flex items-center gap-1.5 text-sm text-blue hover:underline font-medium"
                  >
                    Sign in now
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleReset} className="space-y-4">
                  {resetError && (
                    <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger space-y-1.5">
                      <p>{resetError}</p>
                      {isTokenError && (
                        <Link
                          href="/reset-password"
                          className="inline-block text-xs font-semibold text-blue underline hover:text-blue-mid"
                        >
                          Request a new reset link
                        </Link>
                      )}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="password">
                      New password
                    </label>
                    <p className="text-xs text-slate mb-1.5">
                      Use a strong password you don&apos;t reuse elsewhere.
                    </p>
                    {/* Password rules placed ABOVE the input so mobile keyboards and autofill popovers do not cover them */}
                    <ul id="reset-password-rules" className="mb-2 space-y-1 text-xs">
                      <li className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-600 font-medium" : "text-slate"}`}>
                        {hasMinLength ? <Check size={13} aria-hidden="true" /> : <Circle size={12} className="text-muted" aria-hidden="true" />}
                        <span>At least 12 characters</span>
                      </li>
                      <li className={`flex items-center gap-1.5 ${hasNumberOrSymbol ? "text-emerald-600 font-medium" : "text-slate"}`}>
                        {hasNumberOrSymbol ? <Check size={13} aria-hidden="true" /> : <Circle size={12} className="text-muted" aria-hidden="true" />}
                        <span>Includes a number or symbol</span>
                      </li>
                    </ul>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        minLength={12}
                        pattern="(?=.*[0-9!@#$%^&*()_+\-=\[\]{};':&quot;\\|,.<>/?`~]).{12,}"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => {
                          if (password.length > 0) setPasswordTouched(true);
                        }}
                        aria-invalid={passwordTouched && !isPasswordValid ? "true" : "false"}
                        aria-describedby={
                          passwordTouched && !isPasswordValid
                            ? "reset-password-rules reset-password-error"
                            : "reset-password-rules"
                        }
                        className="w-full border border-border rounded-xl px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors user-invalid:border-danger user-valid:border-emerald-600"
                        placeholder="Enter your new password"
                      />
                      <button
                        type="button"
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-6 min-h-6 flex items-center justify-center text-muted hover:text-ink transition-colors cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      </button>
                    </div>
                    {passwordTouched && !isPasswordValid && (
                      <p id="reset-password-error" className="mt-1.5 text-xs text-danger">
                        <span role="img" aria-label="Error">❌</span> Password must meet all requirements listed above.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="confirm">
                      Confirm new password
                    </label>
                    <div className="relative">
                      <input
                        id="confirm"
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        autoComplete="new-password"
                        minLength={12}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onBlur={() => {
                          if (confirmPassword.length > 0) setConfirmTouched(true);
                        }}
                        aria-invalid={confirmTouched && !isConfirmValid ? "true" : "false"}
                        aria-describedby={
                          confirmTouched && !isConfirmValid ? "reset-confirm-error" : undefined
                        }
                        className="w-full border border-border rounded-xl px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors user-invalid:border-danger"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        aria-pressed={showConfirmPassword}
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 min-w-6 min-h-6 flex items-center justify-center text-muted hover:text-ink transition-colors cursor-pointer"
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showConfirmPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                      </button>
                    </div>
                    {confirmTouched && !isConfirmValid && (
                      <p id="reset-confirm-error" className="mt-1.5 text-xs text-danger">
                        <span role="img" aria-label="Error">❌</span> Passwords do not match.
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                  >
                    {resetLoading && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-offwhite flex items-center justify-center gap-2 text-sm text-slate">
          <Loader2 size={16} className="animate-spin text-blue" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
