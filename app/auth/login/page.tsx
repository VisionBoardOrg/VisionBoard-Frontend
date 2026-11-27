"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Info } from "lucide-react";
import Logo from "@/components/reusables/Logo";
import { getSafeCallbackUrl } from "@/lib/safe-redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl");
  const callbackUrl = getSafeCallbackUrl(rawCallbackUrl, "/dashboard");
  const messageParam = searchParams.get("message");
  const searchParamError = searchParams.get("error");
  const urlError = searchParamError === "OAuthAccountNotLinked"
    ? "An account already exists with the same email address using a different sign-in method."
    : searchParamError?.includes("ACCOUNT_LOCKED")
    ? `Too many failed attempts. This account is temporarily locked for ${searchParamError.split("ACCOUNT_LOCKED:")[1] || "15"} minutes. Please try again later or reset your password.`
    : searchParamError?.includes("RATE_LIMIT_EXCEEDED")
    ? "Too many sign-in attempts from this network. Please wait a few minutes before trying again."
    : searchParamError
    ? "Authentication failed. Please try again."
    : "";

  const [form, setForm] = useState({ email: "", password: "" });
  const [touched, setTouched] = useState({ email: false, password: false });
  const [error, setError] = useState(urlError);
  const [deletionEmail, setDeletionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setError(urlError);
  }, [urlError]);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (loading || googleLoading) return;
    setLoading(true);
    setError("");
    setDeletionEmail(null);

    try {
      const res = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (res?.error) {
        if (res.error.includes("ACCOUNT_DELETION_SCHEDULED")) {
          const userEmail = res.error.split("ACCOUNT_DELETION_SCHEDULED:")[1] || form.email;
          setDeletionEmail(userEmail);
        } else if (res.error.includes("ACCOUNT_LOCKED")) {
          const minutes = res.error.split("ACCOUNT_LOCKED:")[1] || "15";
          setError(`Too many failed attempts. This account is temporarily locked for ${minutes} minutes. Please try again later or reset your password.`);
        } else if (res.error.includes("RATE_LIMIT_EXCEEDED")) {
          setError("Too many sign-in attempts from this network. Please wait a few minutes before trying again.");
        } else {
          setError("Invalid email or password.");
        }
      } else {
        router.push(callbackUrl);
        return;
      }
    } catch {
      setError("Network error while signing in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    if (loading || googleLoading) return;
    setGoogleLoading(true);
    setError("");
    try {
      await signIn("google", { callbackUrl });
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setGoogleLoading(false);
    }
  }

  const registerHref = rawCallbackUrl
    ? `/auth/register?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : "/auth/register";

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <Logo markSize={36} textSize={22} />
          </div>
          <h1 className="text-2xl font-bold text-ink">Welcome back</h1>
          <p className="text-slate text-sm mt-1">Sign in to your workspace</p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          {messageParam === "account-deleted" && (
            <div role="status" className="mb-5 flex items-start gap-2.5 bg-blue-faint border border-blue-light rounded-xl px-4 py-3 text-xs text-ink">
              <Info size={16} className="text-blue shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-semibold">Account scheduled for deletion</p>
                <p className="text-slate leading-relaxed">
                  You&apos;ve been signed out and your account will be permanently removed after 30 days. Changed your mind?{" "}
                  <Link href="/auth/cancel-deletion" className="text-blue font-semibold hover:underline">
                    Restore your account
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}

          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            type="button"
            disabled={loading || googleLoading}
            className="w-full flex items-center justify-center gap-3 border border-border rounded-xl px-4 py-3 text-sm font-medium text-ink hover:bg-offwhite transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {googleLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <GoogleIcon />}
            {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-muted">or continue with email</span>
            </div>
          </div>

          {/* Credentials */}
          <form onSubmit={handleCredentials} className="space-y-4">
            {deletionEmail ? (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger space-y-1">
                <p>Your account is scheduled for deletion. Would you like to restore it?</p>
                <Link
                  href={`/auth/cancel-deletion?email=${encodeURIComponent(deletionEmail)}`}
                  className="inline-block underline font-semibold text-blue hover:text-blue-mid"
                >
                  Restore your account
                </Link>
              </div>
            ) : error ? (
              <div role="alert" className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                spellCheck={false}
                enterKeyHint="next"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onBlur={() => {
                  if (form.email.length > 0) setTouched((prev) => ({ ...prev, email: true }));
                }}
                aria-invalid={touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? "true" : "false"}
                aria-describedby={
                  touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
                    ? "login-email-error"
                    : undefined
                }
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors user-invalid:border-danger"
                placeholder="you@company.com"
              />
              {touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && (
                <p id="login-email-error" className="mt-1.5 text-xs text-danger">
                  <span role="img" aria-label="Error">❌</span> Please enter a valid email address.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-ink" htmlFor="password">
                  Password
                </label>
                <Link href="/reset-password" className="text-xs text-blue hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  enterKeyHint="done"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  onBlur={() => {
                    if (form.password.length > 0) setTouched((prev) => ({ ...prev, password: true }));
                  }}
                  aria-invalid={touched.password && form.password.length === 0 ? "true" : "false"}
                  className="w-full border border-border rounded-xl px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors user-invalid:border-danger"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate mt-6">
          Don&apos;t have an account?{" "}
          <Link href={registerHref} className="text-blue font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-offwhite flex items-center justify-center gap-2 text-sm text-slate">
          <Loader2 size={16} className="animate-spin text-blue" aria-hidden="true" />
          <span>Loading…</span>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18L12.048 13.56C11.24 14.1 10.211 14.42 9 14.42c-2.392 0-4.416-1.616-5.14-3.787H.774v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.86 10.633A5.41 5.41 0 013.56 9c0-.562.096-1.108.3-1.633V5.035H.774A8.996 8.996 0 000 9c0 1.452.348 2.827.774 4.035l3.086-2.402z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.774 5.035L3.86 7.367C4.584 5.196 6.608 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
