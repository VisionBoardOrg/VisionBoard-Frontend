"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Users,
  Building2,
  Sparkles,
  CreditCard,
  ScrollText,
  Shield,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useModalA11y } from "@/hooks/useModalA11y";

const NAV_ITEMS = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/system", label: "System Health", icon: Activity },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
  { href: "/admin/ai-analytics", label: "AI Analytics", icon: Sparkles },
  { href: "/admin/billing", label: "Billing", icon: CreditCard },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLDialogElement>(null);

  // Listen to toggle events dispatched by AdminHeader hamburger button
  useEffect(() => {
    function handleToggle() {
      setMobileOpen((prev) => !prev);
    }
    window.addEventListener("admin:toggle-mobile-nav", handleToggle);
    return () => window.removeEventListener("admin:toggle-mobile-nav", handleToggle);
  }, []);

  // Broadcast open state so AdminHeader's aria-expanded stays in sync
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("admin:mobile-nav-state", { detail: { open: mobileOpen } })
    );
  }, [mobileOpen]);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useModalA11y(mobileDrawerRef, () => setMobileOpen(false), mobileOpen);

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        aria-label="Admin sidebar"
        className={`hidden md:flex flex-col bg-white border-r border-border transition-all duration-200 ${
          collapsed ? "w-16" : "w-56"
        } shrink-0`}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border h-14">
          <div className="w-7 h-7 rounded-lg bg-blue flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" aria-hidden="true" />
          </div>
          {!collapsed && (
            <span className="text-sm font-bold text-ink tracking-tight truncate">
              Admin
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav aria-label="Admin sections" className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-0.5 ${
                  active
                    ? "bg-blue-faint text-blue"
                    : "text-slate hover:text-ink hover:bg-offwhite"
                }`}
                title={collapsed ? label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${active ? "text-blue" : "text-slate"}`}
                  aria-hidden="true"
                />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Top-Layer Navigation Drawer (<dialog> per navigation-drawer) */}
      {mobileOpen && (
        <dialog
          ref={mobileDrawerRef}
          aria-label="Admin menu"
          className="mobile-nav-drawer drawer-scroller fixed inset-0 m-0 p-0 w-screen h-svh max-w-none max-h-none bg-transparent border-0 flex overflow-x-auto snap-x snap-mandatory overscroll-x-none md:hidden backdrop:bg-ink/40"
        >
          <div className="snap-start shrink-0 w-64 max-w-[85vw] h-svh bg-white border-r border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border h-14">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-white" aria-hidden="true" />
                </div>
                <span className="text-sm font-bold text-ink tracking-tight">Admin</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="min-w-8 min-h-8 flex items-center justify-center p-1.5 rounded-lg text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Mobile admin sections" className="flex-1 py-3 overflow-y-auto">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-0.5 ${
                      active
                        ? "bg-blue-faint text-blue"
                        : "text-slate hover:text-ink hover:bg-offwhite"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${active ? "text-blue" : "text-slate"}`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div
            className="drawer-spacer snap-end shrink-0 w-screen h-svh"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
        </dialog>
      )}
    </>
  );
}
