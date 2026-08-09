"use client";

/**
 * ProfileSection — displays user profile details (Name, Email).
 * Read-only by default; toggled via an Edit button with pencil icon.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Check, Loader2, AlertCircle, Pencil, X } from "lucide-react";

interface ProfileSectionProps {
  initialName:  string | null;
  initialEmail: string;
  initialImage?: string | null;
}

export function ProfileSection({ initialName, initialEmail }: ProfileSectionProps) {
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName ?? "");
  const [email, setEmail] = useState(initialEmail);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function handleCancel() {
    setName(initialName ?? "");
    setEmail(initialEmail);
    setError("");
    setIsEditing(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile.");
        return;
      }
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 3000);
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
          <User size={18} className="text-blue" />
          <h2 className="font-semibold text-ink">Profile</h2>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue bg-blue-faint hover:bg-blue/10 border border-blue-light rounded-xl transition-colors cursor-pointer"
          >
            <Pencil size={13} />
            Edit Profile
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4 max-w-md">
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Display name */}
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Display name
          </label>
          <input
            type="text"
            value={name}
            disabled={!isEditing}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
              isEditing
                ? "border-border text-ink bg-white focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue"
                : "border-transparent bg-offwhite/80 text-slate cursor-not-allowed"
            }`}
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Email address
          </label>
          <input
            type="email"
            value={email}
            disabled={!isEditing}
            maxLength={255}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
              isEditing
                ? "border-border text-ink bg-white focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue"
                : "border-transparent bg-offwhite/80 text-slate cursor-not-allowed"
            }`}
          />
          {isEditing && (
            <p className="text-[11px] text-muted mt-1">
              Changing your email will update your sign-in address. You'll need to sign in again.
            </p>
          )}
        </div>

        {/* ── Form Actions ── */}
        {isEditing ? (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-offwhite border border-border text-slate hover:text-ink rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        ) : (
          saved && (
            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                <Check size={14} /> Saved successfully
              </span>
            </div>
          )
        )}
      </form>
    </section>
  );
}
