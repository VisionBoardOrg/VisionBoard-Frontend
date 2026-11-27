"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, Map, Kanban, FileText, Settings,
  Layers, LogOut, Zap, Building2, Target, ListTodo, ChevronLeft, ChevronDown, Check, X, Menu, UserCircle, Users, Search,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";

import Logo, { VBMark } from "../reusables/Logo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { NotificationToast } from "@/components/notifications/NotificationToast";
import { useNotifications, NotificationProvider } from "@/hooks/useNotifications";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { EmailVerificationBanner } from "@/components/reusables/EmailVerificationBanner";
import { ToastProvider } from "@/context/ToastContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { useModalA11y } from "@/hooks/useModalA11y";
import type { PlanTier } from "@prisma/client";
import { WorkspaceWebMCPTools } from "@/components/webmcp/WorkspaceWebMCPTools";

// The copilot drawer is a ~950-line chunk with markdown rendering — load it
// on demand instead of shipping it with every workspace page
const AICopilotDrawer = dynamic(
  () => import("@/components/copilot/AICopilotDrawer").then((m) => ({ default: m.AICopilotDrawer })),
  { ssr: false }
);

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
  /** Active workspace display name */
  workspaceName?: string | null;
  /** List of user's workspaces for quick switching */
  workspaces?: Array<{ id: string; name: string }>;
  /** Optional user profile metadata (falls back to NextAuth session) */
  userName?: string | null;
  userEmail?: string | null;
  userImage?: string | null;
}

const PERSONAL_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/account", label: "Account", icon: UserCircle },
];

const WORKSPACE_NAV = (workspaceId: string) => [
  { href: `/workspace/${workspaceId}/workspace`, label: "Overview", icon: Users },
  { href: `/workspace/${workspaceId}/board`, label: "Board", icon: Kanban },
  { href: `/workspace/${workspaceId}/goals`, label: "Goals", icon: Target },
  { href: `/workspace/${workspaceId}/tasks`, label: "My Tasks", icon: ListTodo },
  { href: `/workspace/${workspaceId}/roadmap`, label: "Roadmap", icon: Map },
  { href: `/workspace/${workspaceId}/docs`, label: "Docs", icon: FileText },
  { href: `/workspace/${workspaceId}/templates`, label: "Templates", icon: Layers },
  { href: `/workspace/${workspaceId}/settings`, label: "Workspace Settings", icon: Settings },
];

/** Human-readable page title for the top bar, derived from the current route */
function pageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/workspaces")) return "My Workspaces";
  if (pathname.startsWith("/account")) return "Account";
  const workspaceMatch = pathname.match(/^\/workspace\/[^/]+\/([^/]+)/);
  if (workspaceMatch) {
    const titles: Record<string, string> = {
      workspace: "Overview",
      board: "Board",
      goals: "Goals",
      tasks: "My Tasks",
      roadmap: "Roadmap",
      docs: "Docs",
      templates: "Templates",
      settings: "Workspace Settings",
    };
    return titles[workspaceMatch[1]] ?? "Workspace";
  }
  return "VisionBoard";
}

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

function AppShellContent({
  workspaceId,
  plan,
  children,
  isOwner,
  aiCreditsUsed,
  aiCreditsMax,
  workspaceName,
  workspaces,
  userName,
  userEmail,
  userImage,
}: AppShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  // Real-time live notifications & toasts (consumed from shared NotificationProvider)
  const { latestLiveEvent, dismissToast } = useNotifications();

  // Desktop sidebar default is open (true)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [wsMenuOpen, setWsMenuOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  const mobileDrawerRef = useRef<HTMLDialogElement>(null);
  const mobileDrawerContentRef = useRef<HTMLDivElement>(null);
  const wsMenuRef = useRef<HTMLDivElement>(null);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Accessible mobile drawer focus trap, Escape handling, top-layer promotion, and focus restoration
  useModalA11y(mobileDrawerRef, closeMobile, mobileOpen);

  // Scroll-snap swipe-to-dismiss observer for mobile navigation drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const dialog = mobileDrawerRef.current;
    const content = mobileDrawerContentRef.current;
    if (!dialog || !content || typeof IntersectionObserver === "undefined") return;

    content.scrollIntoView({ behavior: "instant" as ScrollBehavior, inline: "end" });
    let hasEntered = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          hasEntered = true;
        } else if (hasEntered) {
          closeMobile();
        }
      },
      { root: dialog, threshold: 0.1 }
    );
    observer.observe(content);
    return () => observer.disconnect();
  }, [mobileOpen, closeMobile]);

  // Detect platform for keyboard shortcut hint
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const platform = navigator.platform || navigator.userAgent || "";
      setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
    }
  }, []);

  // Close workspace switcher dropdown on outside click or Escape
  useEffect(() => {
    if (!wsMenuOpen) return;
    function handleOutside(e: MouseEvent) {
      if (wsMenuRef.current && !wsMenuRef.current.contains(e.target as Node)) {
        setWsMenuOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setWsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [wsMenuOpen]);

  // Global ⌘K / Ctrl+K opens the command palette from anywhere in the app
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  const personalItems = PERSONAL_NAV;
  const workspaceItems = workspaceId ? WORKSPACE_NAV(workspaceId) : [];

  // Resolve user metadata (props override session fallback)
  const resolvedUserName = userName ?? session?.user?.name ?? null;
  const resolvedUserEmail = userEmail ?? session?.user?.email ?? null;
  const resolvedUserImage = userImage ?? session?.user?.image ?? null;
  const userInitial = (resolvedUserName?.[0] || resolvedUserEmail?.[0] || "U").toUpperCase();

  // Resolve active workspace display name
  const resolvedWorkspaceName =
    workspaceName ||
    workspaces?.find((w) => w.id === workspaceId)?.name ||
    "Workspace";

  // Determine AI credits display
  const creditsUsed = aiCreditsUsed ?? 0;
  const creditsMax =
    aiCreditsMax ?? (plan ? (PLAN_LIMITS[plan as PlanTier]?.aiCreditsPerMonth ?? -1) : -1);
  const creditsText =
    creditsMax < 0 ? "Unlimited credits" : `${creditsUsed} / ${creditsMax} credits used`;
  const creditsPercent =
    creditsMax > 0 ? Math.min(100, Math.round((creditsUsed / creditsMax) * 100)) : 0;
  const showUpgradeLink = creditsMax >= 0 && isOwner !== false;

  const shortcutLabel = isMac ? "⌘K" : "Ctrl K";

  /** Shared sidebar content — rendered both in the fixed desktop aside and the mobile drawer */
  function renderSidebarContent(isMobileDrawer: boolean, onNavClick?: () => void) {
    const showLabel = isMobileDrawer || sidebarOpen;

    return (
      <>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border h-14 shrink-0">
          <Link
            href="/dashboard"
            prefetch={false}
            onClick={onNavClick}
            aria-label="VisionBoard Dashboard"
            className="inline-flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
          >
            {showLabel ? <Logo markSize={28} textSize={16} /> : <VBMark size={28} />}
          </Link>
        </div>

        {/* Nav */}
        <nav
          aria-label={isMobileDrawer ? "Mobile sidebar navigation" : "Primary sidebar navigation"}
          className="flex-1 py-3 px-2 space-y-4 overflow-y-auto"
        >
          {/* ── PERSONAL SECTION — when not inside a workspace ── */}
          {!workspaceId && (
            <div>
              {showLabel && (
                <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 select-none">
                  Personal
                </div>
              )}
              <div className="space-y-0.5">
                {personalItems.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      prefetch={false}
                      title={!showLabel ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavClick}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-blue-faint text-blue font-medium"
                          : "text-slate hover:bg-offwhite hover:text-ink"
                      }`}
                    >
                      <Icon size={16} className="shrink-0" aria-hidden="true" />
                      {showLabel && <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── WORKSPACE SECTION ── */}
          {workspaceId && (
            <div className="space-y-1.5">
              {/* Back to all workspaces */}
              <Link
                href="/workspaces"
                prefetch={false}
                onClick={onNavClick}
                title={!showLabel ? "My Workspaces" : undefined}
                aria-label="My Workspaces"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-slate hover:text-ink hover:bg-offwhite transition-colors group"
              >
                <ChevronLeft
                  size={13}
                  className="shrink-0 text-slate-400 group-hover:text-ink transition-colors"
                  aria-hidden="true"
                />
                {showLabel && <span className="truncate">My Workspaces</span>}
              </Link>

              {/* Active Workspace Header / Switcher */}
              {showLabel && (
                <div className="relative px-1" ref={wsMenuRef}>
                  {workspaces && workspaces.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setWsMenuOpen((prev) => !prev)}
                        aria-expanded={wsMenuOpen}
                        aria-controls="workspace-switcher-panel"
                        className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-offwhite/80 hover:bg-offwhite border border-border/80 text-left transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-ink truncate">
                            {resolvedWorkspaceName}
                          </div>
                          {plan && (
                            <span
                              className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${
                                PLAN_BADGE[plan] ?? "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {PLAN_LABEL[plan] ?? plan}
                            </span>
                          )}
                        </div>
                        <ChevronDown
                          size={14}
                          className={`shrink-0 text-slate transition-transform ${
                            wsMenuOpen ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        />
                      </button>

                      {wsMenuOpen && (
                        <div
                          id="workspace-switcher-panel"
                          role="group"
                          aria-label="Switch workspace"
                          className="absolute left-1 right-1 top-full mt-1 z-30 bg-white border border-border rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto"
                        >
                          {workspaces.map((ws) => {
                            const isCurrent = ws.id === workspaceId;
                            return (
                              <Link
                                key={ws.id}
                                href={`/workspace/${ws.id}/workspace`}
                                prefetch={false}
                                onClick={() => {
                                  setWsMenuOpen(false);
                                  onNavClick?.();
                                }}
                                className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                                  isCurrent
                                    ? "bg-blue-faint text-blue font-semibold"
                                    : "text-ink hover:bg-offwhite"
                                }`}
                              >
                                <span className="truncate">{ws.name}</span>
                                {isCurrent && (
                                  <Check size={13} className="shrink-0 text-blue" aria-hidden="true" />
                                )}
                              </Link>
                            );
                          })}
                          <div className="my-1 border-t border-border/70" />
                          <Link
                            href="/workspaces"
                            prefetch={false}
                            onClick={() => {
                              setWsMenuOpen(false);
                              onNavClick?.();
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-blue hover:bg-blue-faint/60 transition-colors"
                          >
                            <Building2 size={13} aria-hidden="true" />
                            <span>All Workspaces</span>
                          </Link>
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href="/workspaces"
                      prefetch={false}
                      onClick={onNavClick}
                      className="flex items-center justify-between gap-2 px-2 py-2 rounded-xl bg-offwhite/70 hover:bg-offwhite border border-border/70 transition-colors"
                      title="Switch or manage workspaces"
                    >
                      <span className="text-xs font-bold text-ink truncate">
                        {resolvedWorkspaceName}
                      </span>
                      {plan && (
                        <span
                          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${
                            PLAN_BADGE[plan] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {PLAN_LABEL[plan] ?? plan}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              )}

              <div className="mx-1 border-t border-border/60" />

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
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavClick}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-blue-faint text-blue font-medium"
                          : "text-slate hover:bg-offwhite hover:text-ink"
                      }`}
                    >
                      <Icon size={16} className="shrink-0" aria-hidden="true" />
                      {showLabel && <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        {/* AI Credits badge */}
        {showLabel && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-blue-faint border border-blue-light shrink-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={12} className="text-blue" aria-hidden="true" />
              <span className="text-xs font-semibold text-blue">AI Credits</span>
            </div>
            <div className="text-xs text-slate">{creditsText}</div>
            {creditsMax >= 0 && (
              <div
                role="progressbar"
                aria-label="AI credits usage"
                aria-valuenow={creditsUsed}
                aria-valuemin={0}
                aria-valuemax={creditsMax}
                className="mt-1.5 h-1.5 bg-blue-light rounded-full overflow-hidden"
              >
                <div
                  className="h-full bg-blue rounded-full transition-all"
                  style={{ width: `${creditsPercent}%` }}
                />
              </div>
            )}
            {showUpgradeLink && (
              <Link
                href={workspaceId ? `/workspace/${workspaceId}/settings` : "/account"}
                onClick={onNavClick}
                className="text-[11px] font-medium text-blue hover:underline mt-1.5 inline-block"
              >
                {creditsMax > 0 && creditsUsed >= creditsMax ? "Upgrade for more →" : "Upgrade →"}
              </Link>
            )}
          </div>
        )}

        {/* Persistent Bottom Account / Dashboard / Sign out Section */}
        <div className="border-t border-border p-2 space-y-0.5 shrink-0">
          {workspaceId && (
            <Link
              href="/dashboard"
              prefetch={false}
              onClick={onNavClick}
              title={!showLabel ? "Dashboard" : undefined}
              aria-label="Dashboard"
              aria-current={pathname === "/dashboard" ? "page" : undefined}
              className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
                pathname === "/dashboard"
                  ? "bg-blue-faint text-blue font-medium"
                  : "text-slate hover:bg-offwhite hover:text-ink"
              }`}
            >
              <LayoutDashboard size={16} className="shrink-0" aria-hidden="true" />
              {showLabel && <span className="truncate">Dashboard</span>}
            </Link>
          )}

          <Link
            href="/account"
            prefetch={false}
            onClick={onNavClick}
            title={!showLabel ? (resolvedUserName || resolvedUserEmail || "Account") : undefined}
            aria-label="Account settings"
            aria-current={pathname.startsWith("/account") ? "page" : undefined}
            className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm transition-colors ${
              pathname.startsWith("/account")
                ? "bg-blue-faint text-blue font-medium"
                : "text-slate hover:bg-offwhite hover:text-ink"
            }`}
          >
            {resolvedUserImage ? (
              <Image
                src={resolvedUserImage}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="w-5 h-5 rounded-full object-cover shrink-0 border border-border"
              />
            ) : (
              <span
                aria-hidden="true"
                className="w-5 h-5 rounded-full bg-blue-faint text-blue border border-blue-light flex items-center justify-center text-[10px] font-bold shrink-0"
              >
                {userInitial}
              </span>
            )}
            {showLabel && (
              <span className="flex-1 min-w-0 leading-tight">
                <span className="block text-xs font-semibold text-ink truncate">
                  {resolvedUserName || "Account"}
                </span>
                {resolvedUserEmail && (
                  <span className="block text-[11px] text-slate truncate">{resolvedUserEmail}</span>
                )}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            title={!showLabel ? "Sign out" : undefined}
            aria-label="Sign out"
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-slate hover:bg-offwhite hover:text-ink transition-colors cursor-pointer"
          >
            <LogOut size={16} className="shrink-0" aria-hidden="true" />
            {showLabel && <span>Sign out</span>}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="flex h-dvh bg-offwhite overflow-hidden">
      {/* Skip to main content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-blue focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Real-time floating Notification Toast banner */}
      <NotificationToast event={latestLiveEvent} onDismiss={dismissToast} />

      {/* ── Mobile drawer (native Top-Layer <dialog> with horizontal scroll-snap dismissal) ── */}
      {mobileOpen && (
        <dialog
          id="mobile-sidebar-drawer"
          ref={mobileDrawerRef}
          closedby="any"
          aria-label="Mobile navigation"
          className="fixed inset-0 m-0 p-0 w-screen h-dvh max-w-none max-h-none bg-transparent border-0 flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain md:hidden backdrop:bg-black/40"
        >
          <div
            ref={mobileDrawerContentRef}
            className="relative snap-start shrink-0 flex flex-col bg-white border-r border-border w-64 h-dvh"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={closeMobile}
              className="absolute top-2 right-2 min-w-10 min-h-10 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
              aria-label="Close navigation"
            >
              <X size={18} aria-hidden="true" />
            </button>
            {renderSidebarContent(true, closeMobile)}
          </div>
          {/* Snap target for swipe-to-close gesture & backdrop tap */}
          <div
            className="snap-end shrink-0 w-screen h-dvh"
            aria-hidden="true"
            onClick={closeMobile}
          />
        </dialog>
      )}

      {/* ── Desktop sidebar ── */}
      <aside
        id="desktop-sidebar"
        className={`hidden md:flex flex-col bg-white border-r border-border transition-all duration-300 shrink-0 ${
          sidebarOpen ? "w-56" : "w-14"
        }`}
        aria-label="Desktop navigation"
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <EmailVerificationBanner />

        {/* Top bar */}
        <header className="h-14 border-b border-border bg-white flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shrink-0">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="md:hidden min-w-10 min-h-10 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-drawer"
          >
            <Menu size={20} aria-hidden="true" />
          </button>

          {/* Desktop sidebar toggle */}
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden md:flex min-w-8 min-h-8 items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarOpen}
            aria-controls="desktop-sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>

          {/* Page title (paragraph to avoid duplicate H1 with page views) */}
          <p className="text-sm font-semibold text-ink truncate">
            {pageTitle(pathname)}
          </p>

          <div className="flex-1" />

          {/* Global search / command palette trigger */}
          <button
            type="button"
            onClick={openPalette}
            className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-offwhite/50 text-slate hover:bg-offwhite hover:text-ink transition-colors cursor-pointer"
            aria-label={`Search (${shortcutLabel})`}
          >
            <Search size={15} aria-hidden="true" />
            <span className="hidden md:inline text-sm font-medium">Search…</span>
            <kbd className="hidden md:inline-flex items-center h-5 px-1.5 rounded-md bg-white border border-border text-[10px] font-semibold text-slate">
              {shortcutLabel}
            </kbd>
          </button>

          {/* Notification Bell */}
          <NotificationBell workspaceId={workspaceId} />
        </header>

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>

      {/* ── Global Command Palette (⌘K / Ctrl+K) — mounted only while open ── */}
      {paletteOpen && (
        <CommandPalette
          workspaceId={workspaceId}
          onClose={closePalette}
          onOpenCopilot={() => setCopilotOpen(true)}
        />
      )}

      {/* ── WebMCP browser tool registration ── */}
      {workspaceId && <WorkspaceWebMCPTools workspaceId={workspaceId} />}

      {/* ── Global Semantic AI Copilot Drawer ── */}
      {workspaceId && (
        <AICopilotDrawer
          workspaceId={workspaceId}
          plan={plan}
          aiCreditsUsed={aiCreditsUsed}
          aiCreditsMax={aiCreditsMax}
          isOpen={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          onOpen={() => setCopilotOpen(true)}
        />
      )}
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <NotificationProvider workspaceId={props.workspaceId}>
      <ToastProvider>
        <ConfirmProvider>
          <AppShellContent {...props} />
        </ConfirmProvider>
      </ToastProvider>
    </NotificationProvider>
  );
}
