"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard, Map, Kanban, FileText, Settings,
  Layers, LogOut, Zap, Building2, Target, ListTodo
} from "lucide-react";
import { useState } from "react";

import Logo, { VBMark } from "../reusables/Logo";

interface AppShellProps {
  workspaceId: string;
  role: string | null;
  plan?: string | null;
  children: React.ReactNode;
}

const NAV = (workspaceId: string) => [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: `/workspace/${workspaceId}/board`, label: "Board", icon: Kanban },
  { href: `/workspace/${workspaceId}/goals`, label: "Goals", icon: Target },
  { href: `/workspace/${workspaceId}/tasks`, label: "My Tasks", icon: ListTodo },
  { href: `/workspace/${workspaceId}/roadmap`, label: "Roadmap", icon: Map },
  { href: `/workspace/${workspaceId}/docs`, label: "Docs", icon: FileText },
  { href: `/workspace/${workspaceId}/templates`, label: "Templates", icon: Layers },
  { href: "/workspaces", label: "Workspaces", icon: Building2 },
  { href: `/workspace/${workspaceId}/settings`, label: "Settings", icon: Settings },
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

export function AppShell({ workspaceId, role, plan, children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const navItems = NAV(workspaceId);

  return (
    <div className="flex h-screen bg-offwhite overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-white border-r border-border transition-all duration-300 ${
          sidebarOpen ? "w-56" : "w-14"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border h-14">
          {sidebarOpen ? (
            <Logo markSize={28} textSize={16} />
          ) : (
            <VBMark size={28} />
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : item.href === "/workspaces"
                ? pathname === "/workspaces"
                : pathname === item.href || pathname.startsWith(item.href + "/");
            const isWorkspace = item.label === "Workspace";
            return (
              <Link
                key={item.label}
                href={item.href}
                title={!sidebarOpen ? item.label : undefined}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-blue-faint text-blue font-medium"
                    : "text-slate hover:bg-offwhite hover:text-ink"
                }`}
              >
                <Icon size={16} className="shrink-0" />
                {sidebarOpen && (
                  <span className="flex-1 truncate">{item.label}</span>
                )}
                {sidebarOpen && isWorkspace && plan && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${
                    PLAN_BADGE[plan] ?? "bg-slate-100 text-slate-600"
                  }`}>
                    {PLAN_LABEL[plan] ?? plan}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* AI Credits badge */}
        {sidebarOpen && (
          <div className="mx-3 mb-3 p-3 rounded-xl bg-blue-faint border border-blue-light">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={12} className="text-blue" />
              <span className="text-xs font-semibold text-blue">AI Credits</span>
            </div>
            <div className="text-xs text-slate">10 / month on Free plan</div>
            <Link href={`/workspace/${workspaceId}/settings`} className="text-[11px] text-blue hover:underline mt-1 block">
              Upgrade →
            </Link>
          </div>
        )}

        {/* Sign out */}
        <div className="border-t border-border p-2">
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            title="Sign out"
            className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-sm text-slate hover:bg-offwhite hover:text-ink transition-colors"
          >
            <LogOut size={16} className="shrink-0" />
            {sidebarOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-white flex items-center px-4 gap-4 shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-muted hover:text-ink transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="4" width="14" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
              <rect x="2" y="12.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            </svg>
          </button>

          <div className="flex-1" />

          {role && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-blue-faint text-blue font-medium capitalize">
              {role.replace("_", " ")}
            </span>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
