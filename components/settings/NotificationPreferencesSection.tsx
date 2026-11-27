"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CheckSquare,
  AtSign,
  MessageSquare,
  Target,
  CreditCard,
  Shield,
  RefreshCw,
} from "lucide-react";
import type { UserPreferencesDTO } from "@/lib/notification-preferences";

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<UserPreferencesDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCount, setSavingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const reqSeqRef = useRef(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/user/notification-preferences");
      if (!res.ok) throw new Error("Failed to load preferences");
      const data = await res.json();
      setPrefs(data.preferences);
    } catch {
      setError("Unable to load notification preferences at this time.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  async function updatePreference<K extends keyof UserPreferencesDTO>(
    key: K,
    value: UserPreferencesDTO[K]
  ) {
    if (!prefs) return;

    const prevValue = prefs[key];
    const seq = ++reqSeqRef.current;

    setPrefs((curr) => (curr ? { ...curr, [key]: value } : curr));
    setSavingCount((c) => c + 1);
    setError(null);
    setSavedMessage(null);

    try {
      const res = await fetch("/api/user/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });

      if (!res.ok) {
        throw new Error("Failed to update preferences");
      }

      const data = await res.json();
      // Only overwrite full state from the latest in-flight request so rapid
      // concurrent toggles on other switches are never clobbered by stale responses.
      if (seq === reqSeqRef.current && data.preferences) {
        setPrefs(data.preferences);
      }

      setSavedMessage("Preferences saved.");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedMessage(null), 2500);
    } catch {
      // Roll back only the key that failed so other successful toggles remain intact.
      setPrefs((curr) => (curr ? { ...curr, [key]: prevValue } : curr));
      setError("Failed to save changes. Please try again.");
    } finally {
      setSavingCount((c) => Math.max(0, c - 1));
    }
  }

  const saving = savingCount > 0;

  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-border p-6 flex items-center justify-center min-h-[180px]">
        <Loader2 size={24} className="animate-spin text-blue" aria-hidden="true" />
        <span className="sr-only">Loading notification preferences…</span>
      </section>
    );
  }

  if (!prefs) {
    return (
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Email Notifications</h2>
        </div>
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" aria-hidden="true" />
            <span>{error || "Unable to load preferences."}</span>
          </div>
          <button
            type="button"
            onClick={loadPreferences}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 font-semibold hover:bg-rose-100/50 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw size={12} aria-hidden="true" />
            Retry
          </button>
        </div>
      </section>
    );
  }

  const categoryToggles = [
    {
      id: "tasks" as const,
      label: "Tasks & Deadlines",
      description: "Assignments, blocked alerts, due soon & overdue notices",
      icon: CheckSquare,
      checked: prefs.tasks,
    },
    {
      id: "mentions" as const,
      label: "Mentions & Discussions",
      description: "Direct @mentions in task/goal comments and docs",
      icon: AtSign,
      checked: prefs.mentions,
    },
    {
      id: "comments" as const,
      label: "Comment Activity",
      description: "Comments on tasks and goals you own or collaborate on",
      icon: MessageSquare,
      checked: prefs.comments,
    },
    {
      id: "goalsMilestones" as const,
      label: "Goals & Milestones",
      description: "Milestone slippage detection and goal health score drops",
      icon: Target,
      checked: prefs.goalsMilestones,
    },
    {
      id: "quotasBilling" as const,
      label: "Billing & Plan Quotas",
      description: "Capacity warnings (80%/90%) and Stripe payment confirmations",
      icon: CreditCard,
      checked: prefs.quotasBilling,
    },
    {
      id: "systemAlerts" as const,
      label: "System & Workspace",
      description: "Workspace invitations and member permission updates",
      icon: Shield,
      checked: prefs.systemAlerts,
    },
  ];

  return (
    <section className="bg-white rounded-2xl border border-border p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue rounded-xl">
            <Mail size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-ink text-base">Email Notifications</h2>
            <p className="text-xs text-slate-500">
              Control when VisionBoard sends email alerts to your inbox
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 text-xs" role="status" aria-live="polite">
          {saving && (
            <span className="flex items-center gap-1 text-slate-400">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Saving…
            </span>
          )}
          {savedMessage && !saving && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium animate-fadeIn">
              <CheckCircle2 size={13} aria-hidden="true" /> {savedMessage}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs mb-4">
          <AlertCircle size={14} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Master Toggle */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 flex items-center justify-between gap-4">
        <div>
          <label
            htmlFor="pref-switch-emailEnabled"
            className="text-sm font-semibold text-slate-900 block cursor-pointer"
          >
            Enable Email Notifications
          </label>
          <span id="pref-desc-emailEnabled" className="text-xs text-slate-500 block mt-0.5">
            Master switch to pause or resume all outgoing emails for your account
          </span>
        </div>

        <input
          id="pref-switch-emailEnabled"
          type="checkbox"
          role="switch"
          {...({ switch: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          aria-describedby="pref-desc-emailEnabled"
          className="native-switch"
          checked={prefs.emailEnabled}
          onChange={(e) => updatePreference("emailEnabled", e.target.checked)}
        />
      </div>

      {/* Category Grid */}
      <div
        className={`space-y-3 transition-opacity duration-200 ${
          prefs.emailEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
          Notification Categories
        </span>

        {categoryToggles.map((item) => {
          const Icon = item.icon;
          const switchId = `pref-switch-${item.id}`;
          const descId = `pref-desc-${item.id}`;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg mt-0.5 shrink-0">
                  <Icon size={16} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor={switchId}
                    className="text-xs font-semibold text-slate-800 block cursor-pointer"
                  >
                    {item.label}
                  </label>
                  <p id={descId} className="text-[11px] text-slate-500 mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              <input
                id={switchId}
                type="checkbox"
                role="switch"
                {...({ switch: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
                aria-describedby={descId}
                className="native-switch ml-4"
                checked={item.checked}
                disabled={!prefs.emailEnabled}
                onChange={(e) => updatePreference(item.id, e.target.checked)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
