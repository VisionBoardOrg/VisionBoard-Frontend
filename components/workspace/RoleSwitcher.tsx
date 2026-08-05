"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Code2, BarChart2, Megaphone, ShieldCheck, Briefcase,
  CheckCircle2, Loader2
} from "lucide-react";

export type MemberRole = "pm" | "exec" | "eng" | "marketing" | "admin";

interface RoleOption {
  value: MemberRole;
  label: string;
  title: string;          // example job title
  description: string;
  icon: React.ElementType;
  color: string;          // Tailwind bg/text classes for the icon wrapper
}

const ROLES: RoleOption[] = [
  {
    value: "pm",
    label: "Product Manager",
    title: "PM / CPO / Product Lead",
    description: "Full board access, goal ownership, roadmap control, and team invites.",
    icon: Briefcase,
    color: "bg-blue-faint text-blue",
  },
  {
    value: "exec",
    label: "Executive",
    title: "CEO / CTO / VP / Director",
    description: "Strategic overview dashboard, read access to all goals, key results, and health scores.",
    icon: BarChart2,
    color: "bg-violet-50 text-violet-600",
  },
  {
    value: "eng",
    label: "Engineering",
    title: "Engineer / Tech Lead / Architect",
    description: "Task management, sprint board, milestone tracking, and code-linked docs.",
    icon: Code2,
    color: "bg-cyan-50 text-cyan-700",
  },
  {
    value: "marketing",
    label: "Marketing",
    title: "Marketer / Growth / Brand",
    description: "Campaign goals, roadmap visibility, content-linked docs, and launch milestones.",
    icon: Megaphone,
    color: "bg-amber-50 text-amber-600",
  },
  {
    value: "admin",
    label: "Admin",
    title: "Workspace Admin",
    description: "Full access including member management, billing, integrations, and workspace settings.",
    icon: ShieldCheck,
    color: "bg-emerald-50 text-emerald-600",
  },
];

interface Props {
  workspaceId: string;
  currentRole: MemberRole;
  /** If true this user is an admin who can also change others' roles */
  isAdmin?: boolean;
  /** The current user's own id — used for self role-switch (header dropdown) */
  userId?: string;
  /** Whether the current user is the workspace owner */
  isOwner?: boolean;
  /** Optional: change another member's role */
  targetUserId?: string;
  targetName?: string;
  /** Compact single-column list layout — used in the header dropdown */
  compact?: boolean;
  /** Called after a successful role save (e.g. to close the dropdown) */
  onRoleChange?: () => void;
}

export function RoleSwitcher({
  workspaceId,
  currentRole,
  isAdmin = false,
  userId,
  isOwner = false,
  targetUserId,
  targetName,
  compact = false,
  onRoleChange,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<MemberRole>(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // When no explicit targetUserId is given we're doing a self-switch.
  // Use the caller's own userId so the API receives a valid targetUserId.
  const resolvedTargetId = targetUserId ?? userId;

  async function handleSave(role: MemberRole) {
    if (role === selected && !saving) {
      setSelected(role);
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, targetUserId: resolvedTargetId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update role");

      setSelected(data.role);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onRoleChange?.();
      }, 1200);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {targetName && (
        <p className="text-sm text-slate mb-4">
          Changing role for <span className="font-semibold text-ink">{targetName}</span>
        </p>
      )}

      {compact ? (
        // Compact single-column list for the header dropdown
        <div className="space-y-1">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selected === r.value;
            return (
              <button
                key={r.value}
                disabled={saving}
                onClick={() => { setSelected(r.value); handleSave(r.value); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isActive
                    ? "bg-blue-faint text-blue"
                    : "hover:bg-offwhite text-ink"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${r.color}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isActive ? "text-blue" : "text-ink"}`}>
                    {r.label}
                  </div>
                  <div className="text-[11px] text-muted truncate">{r.title}</div>
                </div>
                {isActive && <CheckCircle2 size={14} className="text-blue shrink-0" />}
              </button>
            );
          })}
        </div>
      ) : (
        // Full 2-column card grid for the settings page
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selected === r.value;
            return (
              <button
                key={r.value}
                disabled={saving}
                onClick={() => {
                  setSelected(r.value);
                  handleSave(r.value);
                }}
                className={`relative text-left rounded-2xl border p-4 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${
                  isActive
                    ? "border-blue bg-blue-faint shadow-sm ring-1 ring-blue/20"
                    : "border-border bg-white hover:border-blue/40 hover:shadow-sm"
                }`}
              >
                {isActive && (
                  <CheckCircle2
                    size={16}
                    className="absolute top-3 right-3 text-blue"
                  />
                )}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${r.color}`}>
                  <Icon size={18} />
                </div>
                <div className="font-semibold text-ink text-sm">{r.label}</div>
                <div className="text-[11px] text-muted mt-0.5 mb-2 font-medium">{r.title}</div>
                <div className="text-xs text-slate leading-relaxed">{r.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {saving && (
        <div className="flex items-center gap-2 text-xs text-blue mt-2">
          <Loader2 size={13} className="animate-spin" />
          Updating role…
        </div>
      )}
      {saved && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 mt-2">
          <CheckCircle2 size={13} />
          {!targetUserId ? "Your role has been updated." : `${targetName ?? "Member"}'s role has been updated.`}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
