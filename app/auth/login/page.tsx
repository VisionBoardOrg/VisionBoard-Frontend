"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/reusables/Logo";
import { getSafeCallbackUrl } from "@/lib/safe-redirect";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"), "/dashboard");
  const searchParamError = searchParams.get("error");
  const urlError = searchParamError === "OAuthAccountNotLinked"
    ? "An account already exists with the same email address using a different sign-in method."
    : searchParamError
    ? "Authentication failed. Please try again."
    : "";

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(urlError);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (res?.error) {
      if (res.error.includes("ACCOUNT_DELETION_SCHEDULED")) {
        const userEmail = res.error.split("ACCOUNT_DELETION_SCHEDULED:")[1] || form.email;
        setError(
          `Your account is scheduled for deletion. Would you like to restore it? <a href="/auth/cancel-deletion?email=${encodeURIComponent(userEmail)}" class="underline font-semibold text-blue hover:text-blue-dark">Cancel account deletion</a>`
        );
      } else {
        setError("Invalid email or password.");
      }
      setLoading(false);
    } else {
      router.push(callbackUrl);
    }
  }

  async function handleGoogle() {
    await signIn("google", { callbackUrl });
  }

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
          {/* Google OAuth */}
          <button
            onClick={handleGoogle}
            type="button"
            className="w-full flex items-center justify-center gap-3 border border-border rounded-xl px-4 py-3 text-sm font-medium text-ink hover:bg-offwhite transition-colors cursor-pointer"
          >
            <GoogleIcon />
            Continue with Google
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
            {error && (
              <div
                className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger"
                dangerouslySetInnerHTML={{ __html: error }}
              />
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                placeholder="you@company.com"
              />
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
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full border border-border rounded-xl px-4 py-2.5 pr-10 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="text-blue font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
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
