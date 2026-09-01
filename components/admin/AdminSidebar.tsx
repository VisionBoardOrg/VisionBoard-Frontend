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
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/admin/overview",     label: "Overview",      icon: LayoutDashboard },
  { href: "/admin/system",       label: "System Health", icon: Activity },
  { href: "/admin/users",        label: "Users",         icon: Users },
  { href: "/admin/workspaces",   label: "Workspaces",    icon: Building2 },
  { href: "/admin/ai-analytics", label: "AI Analytics",  icon: Sparkles },
  { href: "/admin/billing",      label: "Billing",       icon: CreditCard },
  { href: "/admin/audit-logs",   label: "Audit Logs",    icon: ScrollText },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex flex-col bg-white border-r border-border transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      } shrink-0`}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-border h-14">
        <div className="w-7 h-7 rounded-lg bg-blue flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-bold text-ink tracking-tight truncate">
            Admin
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer mb-0.5 ${
                active
                  ? "bg-blue-faint text-blue"
                  : "text-slate hover:text-ink hover:bg-offwhite"
              }`}
              title={collapsed ? label : undefined}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? "text-blue" : "text-slate"}`} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
