"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Code2, BarChart2, Megaphone, ShieldCheck, Briefcase,
  CheckCircle2, Loader2, Lock
} from "lucide-react";
import {
  ROLE_LABELS,
  persistDashboardViewCookie,
  type DashboardView,
} from "@/lib/roles";

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
    label: ROLE_LABELS.pm,
    title: "PM / CPO / Product Lead",
    description: "Full board access, goal ownership, roadmap control, and team invites.",
    icon: Briefcase,
    color: "bg-blue-faint text-blue",
  },
  {
    value: "exec",
    label: ROLE_LABELS.exec,
    title: "CEO / CTO / VP / Director",
    description: "Strategic overview dashboard, read access to all goals, key results, and health scores.",
    icon: BarChart2,
    color: "bg-violet-50 text-violet-600",
  },
  {
    value: "eng",
    label: ROLE_LABELS.eng,
    title: "Engineer / Tech Lead / Architect",
    description: "Task management, sprint board, milestone tracking, and code-linked docs.",
    icon: Code2,
    color: "bg-cyan-50 text-cyan-700",
  },
  {
    value: "marketing",
    label: ROLE_LABELS.marketing,
    title: "Marketer / Growth / Brand",
    description: "Campaign goals, roadmap visibility, content-linked docs, and launch milestones.",
    icon: Megaphone,
    color: "bg-amber-50 text-amber-600",
  },
  {
    value: "admin",
    label: ROLE_LABELS.admin,
    title: "Workspace Admin",
    description: "Full access including member management, billing, integrations, and workspace settings.",
    icon: ShieldCheck,
    color: "bg-emerald-50 text-emerald-600",
  },
];

const VIEW_OPTIONS = ROLES.filter(
  (r): r is RoleOption & { value: DashboardView } => r.value !== "admin"
);

interface DashboardViewSwitcherProps {
  workspaceId: string;
  currentView: DashboardView;
  compact?: boolean;
  onViewChange?: (view: DashboardView) => void;
}

/**
 * Pure UI dashboard-lens switcher.
 * Persists the chosen view in a workspace-scoped cookie and refreshes the page —
 * NEVER mutates RBAC roles or risks Admin/PM self-lockout.
 */
export function DashboardViewSwitcher({
  workspaceId,
  currentView,
  compact = false,
  onViewChange,
}: DashboardViewSwitcherProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<DashboardView>(currentView);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelected(currentView);
  }, [currentView]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleSelect(view: DashboardView) {
    setSelected(view);
    persistDashboardViewCookie(workspaceId, view);
    setSaved(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSaved(false);
    }, 1500);
    onViewChange?.(view);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {compact ? (
        <div className="space-y-1">
          {VIEW_OPTIONS.map((v) => {
            const Icon = v.icon;
            const isActive = selected === v.value;
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelect(v.value)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  isActive
                    ? "bg-blue-faint text-blue"
                    : "hover:bg-offwhite text-ink"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${v.color}`}>
                  <Icon size={14} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isActive ? "text-blue" : "text-ink"}`}>
                    {v.label}
                  </div>
                  <div className="text-[11px] text-muted truncate">{v.title}</div>
                </div>
                {isActive && <CheckCircle2 size={14} className="text-blue shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {VIEW_OPTIONS.map((v) => {
            const Icon = v.icon;
            const isActive = selected === v.value;
            return (
              <button
                key={v.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleSelect(v.value)}
                className={`relative text-left rounded-2xl border p-4 transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "border-blue bg-blue-faint shadow-sm ring-1 ring-blue/20"
                    : "border-border bg-white hover:border-blue/40 hover:shadow-sm"
                }`}
              >
                {isActive && (
                  <CheckCircle2
                    size={16}
                    className="absolute top-3 right-3 text-blue"
                    aria-hidden="true"
                  />
                )}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${v.color}`}>
                  <Icon size={18} aria-hidden="true" />
                </div>
                <div className="font-semibold text-ink text-sm">{v.label}</div>
                <div className="text-[11px] text-muted mt-0.5 mb-2 font-medium">{v.title}</div>
                <div className="text-xs text-slate leading-relaxed">{v.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {saved && (
        <div role="status" className="flex items-center gap-2 text-xs text-emerald-600 mt-2">
          <CheckCircle2 size={13} aria-hidden="true" />
          Switched dashboard view to {ROLE_LABELS[selected]}.
        </div>
      )}
    </div>
  );
}

interface Props {
  workspaceId: string;
  currentRole: MemberRole;
  /** If true this user is an admin who can also change others' roles */
  isAdmin?: boolean;
  /** The current user's own id — used for self role-switch */
  userId?: string;
  /** Whether the current user is the workspace owner */
  isOwner?: boolean;
  /** Optional: change another member's role */
  targetUserId?: string;
  targetName?: string;
  /** Compact single-column list layout */
  compact?: boolean;
  /** Called after a successful role save */
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelected(currentRole);
  }, [currentRole]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const resolvedTargetId = targetUserId ?? userId;
  const isSelf = !targetUserId || targetUserId === userId;

  function getDisabledReason(role: MemberRole): string | null {
    if (isSelf) {
      if ((role === "admin" || role === "pm") && !isOwner && !isAdmin) {
        return "Admin only";
      }
      return null;
    }
    if (!isOwner && !isAdmin) {
      return "Admin only";
    }
    if (role === "admin" && !isOwner) {
      return "Owner only";
    }
    return null;
  }

  async function handleSave(role: MemberRole) {
    if (saving || role === currentRole) return;
    if (getDisabledReason(role)) return;

    setSelected(role);
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, targetUserId: resolvedTargetId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update role");

      setSelected(data.role);
      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSaved(false);
        onRoleChange?.();
      }, 1200);
      router.refresh();
    } catch (err: unknown) {
      // Revert optimistic selection on failure
      setSelected(currentRole);
      setError(err instanceof Error ? err.message : "Failed to update role");
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
        <div className="space-y-1">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selected === r.value;
            const disabledReason = getDisabledReason(r.value);
            const isDisabled = saving || Boolean(disabledReason);
            return (
              <button
                key={r.value}
                type="button"
                disabled={isDisabled}
                title={disabledReason ? `${r.label} (${disabledReason})` : undefined}
                aria-pressed={isActive}
                onClick={() => handleSave(r.value)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isActive
                    ? "bg-blue-faint text-blue"
                    : "hover:bg-offwhite text-ink"
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${r.color}`}>
                  <Icon size={14} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isActive ? "text-blue" : "text-ink"}`}>
                    {r.label}
                  </div>
                  <div className="text-[11px] text-muted truncate">
                    {disabledReason ? disabledReason : r.title}
                  </div>
                </div>
                {disabledReason ? (
                  <Lock size={13} className="text-muted shrink-0" aria-hidden="true" />
                ) : isActive ? (
                  <CheckCircle2 size={14} className="text-blue shrink-0" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const isActive = selected === r.value;
            const disabledReason = getDisabledReason(r.value);
            const isDisabled = saving || Boolean(disabledReason);
            return (
              <button
                key={r.value}
                type="button"
                disabled={isDisabled}
                title={disabledReason ? `${r.label} (${disabledReason})` : undefined}
                aria-pressed={isActive}
                onClick={() => handleSave(r.value)}
                className={`relative text-left rounded-2xl border p-4 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isActive
                    ? "border-blue bg-blue-faint shadow-sm ring-1 ring-blue/20"
                    : "border-border bg-white hover:border-blue/40 hover:shadow-sm"
                }`}
              >
                {disabledReason ? (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold text-muted bg-offwhite border border-border px-2 py-0.5 rounded-full">
                    <Lock size={10} aria-hidden="true" /> {disabledReason}
                  </span>
                ) : isActive ? (
                  <CheckCircle2
                    size={16}
                    className="absolute top-3 right-3 text-blue"
                    aria-hidden="true"
                  />
                ) : null}
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${r.color}`}>
                  <Icon size={18} aria-hidden="true" />
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
        <div role="status" className="flex items-center gap-2 text-xs text-blue mt-2">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          Updating role…
        </div>
      )}
      {saved && (
        <div role="status" className="flex items-center gap-2 text-xs text-emerald-600 mt-2">
          <CheckCircle2 size={13} aria-hidden="true" />
          {isSelf ? "Your role has been updated." : `${targetName ?? "Member"}'s role has been updated.`}
        </div>
      )}
      {error && (
        <div role="alert" className="text-xs text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
