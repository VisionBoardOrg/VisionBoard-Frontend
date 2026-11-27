"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw, Menu, AlertCircle } from "lucide-react";

const ROUTE_META: Array<{ prefix: string; label: string }> = [
  { prefix: "/admin/overview", label: "Overview" },
  { prefix: "/admin/system", label: "System Health" },
  { prefix: "/admin/users", label: "Users" },
  { prefix: "/admin/workspaces", label: "Workspaces" },
  { prefix: "/admin/ai-analytics", label: "AI Analytics" },
  { prefix: "/admin/billing", label: "Billing" },
  { prefix: "/admin/audit-logs", label: "Audit Logs" },
];

function getBreadcrumb(pathname: string) {
  const matched = ROUTE_META.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  if (!matched) {
    return { sectionHref: "/admin/overview", sectionLabel: "Admin", isDetail: false };
  }
  const isDetail = pathname.length > matched.prefix.length + 1;
  return { sectionHref: matched.prefix, sectionLabel: matched.label, isDetail };
}

export default function AdminHeader() {
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    function handleNavState(e: Event) {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === "boolean") {
        setMobileNavOpen(detail.open);
      }
    }
    window.addEventListener("admin:mobile-nav-state", handleNavState);
    return () => window.removeEventListener("admin:mobile-nav-state", handleNavState);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const res = await fetch("/api/admin/logout", { method: "POST" });
      if (!res.ok) {
        setLogoutError("Sign out failed. Please try again.");
        setLoggingOut(false);
        return;
      }
      window.location.href = "/admin/login";
    } catch {
      setLogoutError("Network error while signing out.");
      setLoggingOut(false);
    }
  }

  const { sectionHref, sectionLabel, isDetail } = getBreadcrumb(pathname);

  return (
    <header className="min-h-14 flex flex-col justify-center px-4 sm:px-6 bg-white border-b border-border shrink-0">
      <div className="h-14 flex items-center justify-between gap-2">
        {/* Left: Mobile hamburger + interactive breadcrumbs */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("admin:toggle-mobile-nav"))}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileNavOpen}
            className="md:hidden p-2 -ml-1 rounded-lg text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <nav aria-label="Breadcrumbs" className="text-sm min-w-0">
            <ol className="breadcrumb-list min-w-0">
              <li className="shrink-0">
                <Link
                  href="/admin/overview"
                  className="text-muted hover:text-ink font-medium transition-colors"
                >
                  Admin
                </Link>
              </li>
              {isDetail ? (
                <>
                  <li className="min-w-0">
                    <Link
                      href={sectionHref}
                      className="text-muted hover:text-ink font-medium transition-colors truncate"
                    >
                      {sectionLabel}
                    </Link>
                  </li>
                  <li className="min-w-0">
                    <Link
                      href={pathname}
                      aria-current="page"
                      className="text-ink font-semibold truncate"
                    >
                      Details
                    </Link>
                  </li>
                </>
              ) : (
                <li className="min-w-0">
                  <Link
                    href={sectionHref}
                    aria-current="page"
                    className="text-ink font-semibold truncate"
                  >
                    {sectionLabel}
                  </Link>
                </li>
              )}
            </ol>
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Live status pill */}
          <div className="hidden sm:flex items-center gap-1.5 bg-success/10 border border-success/20 rounded-full px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-xs font-semibold text-success">Platform Live</span>
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate hover:text-danger hover:bg-danger/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loggingOut ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </div>

      {logoutError && (
        <div
          role="alert"
          className="mb-2 px-3 py-1.5 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger font-medium flex items-center gap-1.5"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{logoutError}</span>
        </div>
      )}
    </header>
  );
}
