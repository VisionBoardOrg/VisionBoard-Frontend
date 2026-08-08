"use client";

/**
 * ProfileSection — lets users edit their name, email, and profile image URL.
 * Lives inside the account settings page.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Check, Loader2, AlertCircle } from "lucide-react";

interface ProfileSectionProps {
  initialName:  string | null;
  initialEmail: string;
  initialImage: string | null;
}

export function ProfileSection({ initialName, initialEmail, initialImage }: ProfileSectionProps) {
  const router = useRouter();

  const [name,  setName]  = useState(initialName  ?? "");
  const [email, setEmail] = useState(initialEmail);
  const [image, setImage] = useState(initialImage ?? "");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [saved,   setSaved]   = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setLoading(true);

    try {
      const res = await fetch("/api/user/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:  name.trim()  || undefined,
          email: email.trim() || undefined,
          image: image.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to update profile.");
        return;
      }
      setSaved(true);
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
      <div className="flex items-center gap-2 mb-5">
        <User size={18} className="text-blue" />
        <h2 className="font-semibold text-ink">Profile</h2>
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
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue"
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
            maxLength={255}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue"
          />
          <p className="text-[11px] text-muted mt-1">
            Changing your email will update your sign-in address. You'll need to sign in again.
          </p>
        </div>

        {/* Profile image URL */}
        <div>
          <label className="block text-xs font-semibold text-ink mb-1.5">
            Profile image URL <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            type="url"
            value={image}
            maxLength={500}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border text-sm text-ink placeholder:text-muted focus:outline-none focus:border-blue focus:ring-1 focus:ring-blue"
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue text-white rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {loading ? "Saving…" : "Save changes"}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
