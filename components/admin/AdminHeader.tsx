"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, RefreshCw } from "lucide-react";

const ROUTE_LABELS: Record<string, string> = {
  "/admin/overview":     "Overview",
  "/admin/system":       "System Health",
  "/admin/users":        "Users",
  "/admin/workspaces":   "Workspaces",
  "/admin/ai-analytics": "AI Analytics",
  "/admin/billing":      "Billing",
  "/admin/audit-logs":   "Audit Logs",
};

function getPageLabel(pathname: string): string {
  for (const [prefix, label] of Object.entries(ROUTE_LABELS)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return label;
  }
  return "Admin";
}

export default function AdminHeader() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      window.location.href = "/admin/login";
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-border shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted font-medium">Admin</span>
        <span className="text-muted">/</span>
        <span className="text-ink font-semibold">{getPageLabel(pathname)}</span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Live status pill */}
        <div className="hidden sm:flex items-center gap-1.5 bg-success/10 border border-success/20 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-xs font-semibold text-success">Platform Live</span>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate hover:text-danger hover:bg-danger/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loggingOut ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <LogOut className="w-3.5 h-3.5" />
          )}
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
