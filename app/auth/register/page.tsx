"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/reusables/Logo";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Preserve callbackUrl so invite tokens survive the post-registration redirect
  const callbackUrl = searchParams.get("callbackUrl") || "/onboarding";
  const prefillEmail = searchParams.get("email") || "";

  const [form, setForm] = useState({ name: "", email: prefillEmail, password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Registration failed.");
      setLoading(false);
      return;
    }

    // Auto sign in after registration — redirect to callbackUrl (preserves invite token)
    await signIn("credentials", {
      email: form.email,
      password: form.password,
      callbackUrl,
    });
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
          <h1 className="text-2xl font-bold text-ink">Create your account</h1>
          <p className="text-slate text-sm mt-1">Start your 14-day free trial — no credit card needed</p>
        </div>

        <div className="bg-white rounded-2xl border border-border p-8 shadow-sm">
          <button
            onClick={handleGoogle}
            type="button"
            className="w-full flex items-center justify-center gap-3 border border-border rounded-xl px-4 py-3 text-sm font-medium text-ink hover:bg-offwhite transition-colors"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-muted">or register with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="name">Full name</label>
              <input
                id="name" type="text" required autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                placeholder="Ade Johnson"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="reg-email">Email</label>
              <input
                id="reg-email" type="email" required autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="reg-password">Password</label>
              <input
                id="reg-password" type="password" required autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                placeholder="Minimum 8 characters"
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password" type="password" required autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>

            <p className="text-xs text-muted text-center">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-slate mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-blue font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
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