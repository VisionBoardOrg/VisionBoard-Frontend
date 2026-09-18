"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import type { UserPreferencesDTO } from "@/lib/notification-preferences";

export function NotificationPreferencesSection() {
  const [prefs, setPrefs] = useState<UserPreferencesDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadPreferences() {
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
    }

    loadPreferences();
  }, []);

  async function updatePreference<K extends keyof UserPreferencesDTO>(
    key: K,
    value: UserPreferencesDTO[K]
  ) {
    if (!prefs) return;

    const previous = { ...prefs };
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);
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
      setPrefs(data.preferences);
      setSavedMessage("Preferences saved.");
      setTimeout(() => setSavedMessage(null), 2500);
    } catch {
      setPrefs(previous);
      setError("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-border p-6 flex items-center justify-center min-h-[180px]">
        <Loader2 size={24} className="animate-spin text-blue" />
      </section>
    );
  }

  if (!prefs) {
    return (
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-3">
          <Bell size={18} className="text-blue" />
          <h2 className="font-semibold text-ink">Email Notifications</h2>
        </div>
        <p className="text-xs text-muted">
          {error || "Unable to load preferences."}
        </p>
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <Mail size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-ink text-base">Email Notifications</h2>
            <p className="text-xs text-slate-500">
              Control when VisionBoard sends email alerts to your inbox
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 text-xs">
          {saving && (
            <span className="flex items-center gap-1 text-slate-400">
              <Loader2 size={13} className="animate-spin" /> Saving...
            </span>
          )}
          {savedMessage && (
            <span className="flex items-center gap-1 text-emerald-600 font-medium animate-fadeIn">
              <CheckCircle2 size={13} /> {savedMessage}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs mb-4">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Master Toggle */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-slate-900 block">
            Enable Email Notifications
          </span>
          <span className="text-xs text-slate-500 block mt-0.5">
            Master switch to pause or resume all outgoing emails for your account
          </span>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={prefs.emailEnabled}
            onChange={(e) => updatePreference("emailEnabled", e.target.checked)}
          />
          <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
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
          return (
            <div
              key={item.id}
              className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-slate-100 text-slate-600 rounded-lg mt-0.5">
                  <Icon size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-800">
                    {item.label}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={item.checked}
                  disabled={!prefs.emailEnabled}
                  onChange={(e) => updatePreference(item.id, e.target.checked)}
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
