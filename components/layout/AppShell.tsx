"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Map, Kanban, FileText, Settings,
  Layers, LogOut, Zap, Building2, Target, ListTodo, ChevronDown, ChevronLeft, X, Menu, UserCircle, Users,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";

import Logo, { VBMark } from "../reusables/Logo";
import { RoleSwitcher } from "@/components/workspace/RoleSwitcher";
import type { MemberRole } from "@/components/workspace/RoleSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationToast } from "@/components/notifications/NotificationToast";
import { useNotifications, NotificationProvider } from "@/hooks/useNotifications";

interface AppShellProps {
  workspaceId: string | null;
  role: string | null;
  plan?: string | null;
  children: React.ReactNode;
  /** Current user's id — needed so the role switcher can send self-updates */
  userId?: string | null;
  /** Whether the current user is the workspace owner */
  isOwner?: boolean;
  /** Live AI credits used — passed from server so sidebar stays accurate */
  aiCreditsUsed?: number;
  aiCreditsMax?: number;
}

const PERSONAL_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/account", label: "Account", icon: UserCircle },
];

const WORKSPACE_NAV = (workspaceId: string) => [
  { href: `/workspace/${workspaceId}/workspace`, label: "Overview & Team", icon: Users },
  { href: `/workspace/${workspaceId}/board`, label: "Board", icon: Kanban },
  { href: `/workspace/${workspaceId}/goals`, label: "Goals", icon: Target },
  { href: `/workspace/${workspaceId}/tasks`, label: "My Tasks", icon: ListTodo },
  { href: `/workspace/${workspaceId}/roadmap`, label: "Roadmap", icon: Map },
  { href: `/workspace/${workspaceId}/docs`, label: "Docs", icon: FileText },
  { href: `/workspace/${workspaceId}/templates`, label: "Templates", icon: Layers },
  { href: `/workspace/${workspaceId}/settings`, label: "Workspace Settings", icon: Settings },
];

const PLAN_BADGE: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  startup: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  growth: "bg-blue-faint text-blue border border-blue-light",
  enterprise: "bg-violet-50 text-violet-700 border border-violet-200",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  startup: "Startup",
  growth: "Growth",
  enterprise: "Enterprise",
};

function AppShellContent({ workspaceId, role, plan, children, userId, isOwner, aiCreditsUsed, aiCreditsMax }: AppShellProps) {
  const pathname = usePathname();
  // Real-time live notifications & toasts (consumed from shared NotificationProvider)
  const { latestLiveEvent, dismissToast } = useNotifications();

  // Desktop sidebar default is open (true)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Restore saved sidebar preference after mount to prevent SSR hydration mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem("visionboard_sidebar_open");
      if (saved !== null) {
        setSidebarOpen(saved === "true");
      }
    } catch {}
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("visionboard_sidebar_open", String(next));
      } catch {}
      return next;
    });
  };

  // Close role dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const personalItems = PERSONAL_NAV;
  const workspaceItems = workspaceId ? WORKSPACE_NAV(workspaceId) : [];

  // Determine AI credits display
  const creditsUsed = aiCreditsUsed ?? 0;
  const creditsMax  = aiCreditsMax  ?? (plan === "free" ? 10 : plan === "startup" ? 100 : -1);
  const creditsText = creditsMax < 0
    ? "Unlimited credits"
    : `${creditsUsed} / ${creditsMax} credits used`;

  /** Shared sidebar content — rendered both in the fixed desktop aside and the mobile drawer */
  function renderSidebarContent(onNavClick?: () => void) {
    const showLabel = sidebarOpen || mobileOpen;

    return (
      <>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border h-14 shrink-0">
          {showLabel ? (
            <Logo markSize={28} textSize={16} />
          ) : (
            <VBMark size={28} />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
          {/* ── PERSONAL SECTION — only when not inside a workspace ── */}
          {!workspaceId && (
            <div>
              {showLabel && (
                <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  Personal
                </div>
              )}
              <div className="space-y-0.5">
                {personalItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      prefetch={false}
                      title={!showLabel ? item.label : undefined}
                      onClick={onNavClick}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-blue-faint text-blue font-medium"
                          : "text-slate hover:bg-offwhite hover:text-ink"
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      {showLabel && <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── WORKSPACE SECTION ── */}
          {workspaceId && (
            <div className="space-y-1">
              {/* Back to personal */}
              <Link
                href="/workspaces"
                prefetch={false}
                onClick={onNavClick}
                title={!showLabel ? "My Workspaces" : undefined}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate hover:text-ink hover:bg-offwhite transition-colors group"
              >
                <ChevronLeft size={13} className="shrink-0 text-slate-400 group-hover:text-ink transition-colors" />
                {showLabel && <span className="truncate">My Workspaces</span>}
              </Link>
              <div className="mx-1 border-t border-border/60" />
              {showLabel && (
                <div className="px-2.5 pb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                  <span>Workspace</span>
                  {plan && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none lowercase ${
                      PLAN_BADGE[plan] ?? "bg-slate-100 text-slate-600"
                    }`}>
                      {PLAN_LABEL[plan] ?? plan}
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-0.5">
                {workspaceItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      prefetch={false}
                      title={!showLabel ? item.label : undefined}
                      onClick={onNavClick}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-blue-faint text-blue font-medium"
                          : "text-slate hover:bg-offwhite hover:text-ink"
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      {showLabel && <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* AI Credits badge */}
        {(sidebarOpen || mobileOpen) && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-blue-faint border border-blue-light shrink-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={12} className="text-blue" />
              <span className="text-xs font-semibold text-blue">AI Credits</span>
            </div>
            <div className="text-xs text-slate">{creditsText}</div>
            {creditsMax >= 0 && (
              <div className="mt-1.5 h-1 bg-blue-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue rounded-full transition-all"
                  style={{ width: `${Math.min(100, (creditsUsed / creditsMax) * 100)}%` }}
                />
              </div>
            )}
            <Link href={workspaceId ? `/workspace/${workspaceId}/settings` : "/workspaces"} className="text-[11px] text-blue hover:underline mt-1 block">
              {creditsMax >= 0 && creditsUsed >= creditsMax ? "Upgrade for more →" : "Upgrade →"}
            </Link>
          </div>
        )}

        {/* Sign out */}
        <div className="border-t border-border p-2 shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            title="Sign out"
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-slate hover:bg-offwhite hover:text-ink transition-colors"
          >
            <LogOut size={16} className="shrink-0" />
            {(sidebarOpen || mobileOpen) && <span>Sign out</span>}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-screen bg-offwhite overflow-hidden">
      {/* Real-time floating Notification Toast banner */}
      <NotificationToast event={latestLiveEvent} onDismiss={dismissToast} />

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-border w-64 transform transition-transform duration-300 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Mobile navigation"
      >
        {/* Close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-3 right-3 p-1.5 rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>
        {renderSidebarContent(() => setMobileOpen(false))}
      </aside>

      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden md:flex flex-col bg-white border-r border-border transition-all duration-300 shrink-0 ${
          sidebarOpen ? "w-56" : "w-14"
        }`}
        aria-label="Desktop navigation"
      >
        {renderSidebarContent()}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-white flex items-center px-4 gap-3 shrink-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden text-muted hover:text-ink transition-colors p-1"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="hidden md:block text-muted hover:text-ink transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>

          <div className="flex-1" />

          {/* Notification Bell */}
          <NotificationBell workspaceId={workspaceId} />

          {/* Role switcher dropdown */}
          {role && workspaceId && (
            <div className="relative" ref={roleDropdownRef}>
              <button
                onClick={() => setRoleDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-faint text-blue font-medium capitalize hover:bg-blue/10 transition-colors cursor-pointer"
                aria-label="Switch role"
              >
                <span className="hidden sm:inline">
                  {isOwner ? "Owner" : role.replace("_", " ")}
                </span>
                <span className="sm:hidden">
                  {isOwner ? "O" : role.charAt(0).toUpperCase()}
                </span>
                <ChevronDown size={11} className={`transition-transform ${roleDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {roleDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-border rounded-2xl shadow-xl p-4 w-64 sm:w-72">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Switch dashboard view</p>
                  <RoleSwitcher
                    workspaceId={workspaceId!}
                    currentRole={role as MemberRole}
                    userId={userId ?? undefined}
                    isOwner={isOwner}
                    compact
                    onRoleChange={() => setRoleDropdownOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 no-scrollbar">{children}</main>
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <NotificationProvider workspaceId={props.workspaceId}>
      <AppShellContent {...props} />
    </NotificationProvider>
  );
}

