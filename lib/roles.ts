import type { MemberRole } from "@prisma/client";

export type DashboardView = "pm" | "exec" | "eng" | "marketing";

export const VALID_DASHBOARD_VIEWS: readonly DashboardView[] = [
  "pm",
  "exec",
  "eng",
  "marketing",
] as const;

/** Canonical human-readable role labels used consistently across the entire app. */
export const ROLE_LABELS: Record<MemberRole, string> = {
  pm: "Product Manager",
  exec: "Executive / Strategy",
  eng: "Engineering / Ops",
  marketing: "Marketing / Growth",
  admin: "Admin",
};

export const ROLE_SHORT_LABELS: Record<MemberRole, string> = {
  pm: "Product Manager",
  exec: "Executive",
  eng: "Engineering",
  marketing: "Marketing",
  admin: "Admin",
};

export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return "Member";
  return ROLE_LABELS[role as MemberRole] ?? role.replace(/_/g, " ");
}

export function isDashboardView(value: string | null | undefined): value is DashboardView {
  return Boolean(value && (VALID_DASHBOARD_VIEWS as readonly string[]).includes(value));
}

export function dashboardViewCookieName(workspaceId: string): string {
  return `vb_view_${workspaceId}`;
}

export function persistDashboardViewCookie(workspaceId: string, view: DashboardView): void {
  if (typeof document === "undefined") return;
  document.cookie = `${dashboardViewCookieName(workspaceId)}=${view}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Resolve the active dashboard view lens from a saved cookie preference
 * or fall back to the member's role (admins default to PM view).
 */
export function resolveDashboardView(
  savedCookieValue: string | null | undefined,
  memberRole: MemberRole
): DashboardView {
  if (isDashboardView(savedCookieValue)) return savedCookieValue;
  if (memberRole === "exec" || memberRole === "eng" || memberRole === "marketing") {
    return memberRole;
  }
  return "pm";
}
