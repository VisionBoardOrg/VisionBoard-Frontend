"use client";

/**
 * ProfileSection — displays user profile details (Name, Email).
 * Read-only by default; toggled via an Edit button with pencil icon.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Check, Loader2, AlertCircle, Pencil, X } from "lucide-react";

interface ProfileSectionProps {
  initialName:  string | null;
  initialEmail: string;
  initialImage?: string | null;
  isOAuthUser?: boolean;
}

export function ProfileSection({ initialName, initialEmail, isOAuthUser = false }: ProfileSectionProps) {
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail);
  const [currentPassword, setCurrentPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameChanged = trimmedName !== (initialName ?? "").trim();
  const emailChanged = !isOAuthUser && trimmedEmail.toLowerCase() !== initialEmail.toLowerCase();
  const isDirty = nameChanged || emailChanged;

  function handleCancel() {
    setName(initialName ?? "");
    setEmail(initialEmail);
    setCurrentPassword("");
    setError("");
    setIsEditing(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty || loading) return;
    if (emailChanged && !currentPassword) {
      setError("Please enter your current password to confirm your email change.");
      return;
    }

    setError("");
    setSavedMessage(null);
    setLoading(true);

    try {
      const payload: Record<string, string | undefined> = {};
      if (nameChanged) {
        payload.name = trimmedName || undefined;
      }
      if (emailChanged) {
        payload.email = trimmedEmail || undefined;
        payload.currentPassword = currentPassword;
      }
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile.");
        return;
      }
      setCurrentPassword("");
      setIsEditing(false);
      setSavedMessage(
        data.emailVerificationSent
          ? "Profile saved. Check your new email inbox to verify your address."
          : "Saved successfully"
      );
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedMessage(null), 5000);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-border p-6">
      {/* ── Section Header with Edit Toggle Button ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <User size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Profile</h2>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue bg-blue-faint hover:bg-blue/10 border border-blue-light rounded-xl transition-colors cursor-pointer"
          >
            <Pencil size={13} aria-hidden="true" />
            Edit Profile
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        {error && (
          <div role="alert" className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Display name */}
        <div>
          <label htmlFor="profile-name" className="block text-xs font-semibold text-ink mb-1.5">
            Display name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            disabled={!isEditing}
            maxLength={100}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
              isEditing
                ? "border-border text-ink bg-white focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/30"
                : "border-transparent bg-offwhite/80 text-slate cursor-not-allowed"
            }`}
          />
        </div>

        {/* Email */}
        <div>
          <label htmlFor="profile-email" className="block text-xs font-semibold text-ink mb-1.5">
            Email address
          </label>
          <input
            id="profile-email"
            type="email"
            value={email}
            disabled={!isEditing || isOAuthUser}
            maxLength={255}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
              isEditing && !isOAuthUser
                ? "border-border text-ink bg-white focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/30"
                : "border-transparent bg-offwhite/80 text-slate cursor-not-allowed"
            }`}
          />
          {isEditing && isOAuthUser ? (
            <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
              <p className="text-[11px] text-amber-800 leading-snug">
                Your email address is managed by your OAuth provider (Google, GitHub, etc.)
                and cannot be changed here. To update it, change it directly in your provider&apos;s
                account settings.
              </p>
            </div>
          ) : isEditing ? (
            <p className="text-[11px] text-muted mt-1 leading-relaxed">
              Changing your email requires your current password. We&apos;ll send a verification link to your new address and a security alert to your previous address.
            </p>
          ) : null}
        </div>

        {/* Current password confirmation — required only when changing email */}
        {isEditing && emailChanged && (
          <div>
            <label htmlFor="profile-current-password" className="block text-xs font-semibold text-ink mb-1.5">
              Current password <span className="text-danger">*</span>
            </label>
            <input
              id="profile-current-password"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password to confirm"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink bg-white focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/30 transition-colors"
            />
          </div>
        )}

        {/* ── Form Actions ── */}
        {isEditing ? (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!isDirty || loading || (emailChanged && !currentPassword)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              {loading ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-offwhite border border-border text-slate hover:text-ink rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              <X size={14} aria-hidden="true" />
              Cancel
            </button>
          </div>
        ) : (
          savedMessage && (
            <div role="status" className="pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <Check size={14} aria-hidden="true" /> {savedMessage}
              </span>
            </div>
          )
        )}
      </form>
    </section>
  );
}
