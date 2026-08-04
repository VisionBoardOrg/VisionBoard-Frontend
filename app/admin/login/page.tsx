"use client";

import React, { useState } from "react";
import { Lock, Shield, AlertCircle, ArrowRight, User, Eye, EyeOff } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Redirect to admin dashboard
        window.location.href = "/admin/waitlist";
      } else {
        setError(data.message || "Invalid credentials, please try again.");
      }
    } catch {
      setError("A connection error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-offwhite">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-16 relative overflow-hidden">
        {/* Dynamic background dot grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#DBEAFE_1.5px,transparent_1.5px)] bg-size-[24px_24px] opacity-70 pointer-events-none" />

        {/* Decorative colored glow orbs */}
        <div className="absolute -left-40 top-1/4 w-96 h-96 bg-blue/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -right-40 bottom-1/4 w-96 h-96 bg-cyan/15 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-white rounded-3xl border border-border shadow-2xl p-8 space-y-6 relative z-10 overflow-hidden">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-faint border border-blue-light flex items-center justify-center mx-auto text-blue mb-3">
              <Shield className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-ink tracking-tight flex items-center justify-center gap-1.5">
              Admin Portal
            </h2>
            <p className="text-xs text-slate font-medium">
              Enter credentials to access the waitlist control center.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-danger font-medium animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">Username</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full pl-10 pr-4 py-2.5 bg-offwhite/50 border border-border rounded-xl text-sm font-medium text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate absolute left-3.5 top-3" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-offwhite/50 border border-border rounded-xl text-sm font-medium text-ink placeholder:text-slate/60 focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate hover:text-ink transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue text-white font-bold text-sm py-3 px-6 rounded-xl hover:bg-blue-mid transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <span>{isLoading ? "Signing in..." : "Authenticate"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
