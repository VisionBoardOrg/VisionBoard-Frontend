"use client";

import { useEffect, useState } from "react";
import { Users, Hash, CreditCard, LayoutGrid } from "lucide-react";
import { PMDashboard } from "@/components/dashboard/PMDashboard";
import { ExecDashboard } from "@/components/dashboard/ExecDashboard";
import { EngDashboard } from "@/components/dashboard/EngDashboard";
import { MarketingDashboard } from "@/components/dashboard/MarketingDashboard";
import { DashboardViewSwitcher, type MemberRole } from "@/components/workspace/RoleSwitcher";
import { ROLE_LABELS, type DashboardView } from "@/lib/roles";
import type { DashboardWorkspace } from "@/types/dashboard";

const ROLE_BADGE_COLORS: Record<MemberRole, string> = {
  pm: "bg-blue-faint text-blue",
  exec: "bg-violet-50 text-violet-700",
  eng: "bg-cyan-50 text-cyan-700",
  marketing: "bg-amber-50 text-amber-600",
  admin: "bg-emerald-50 text-emerald-600",
};

interface WorkspaceDashboardClientProps {
  workspace: DashboardWorkspace;
  userId: string;
  userName: string;
  myRole: MemberRole;
  planName: string;
  initialView: DashboardView;
}

/**
 * Client-side dashboard view container.
 * Renders all 4 tailored lenses (PM / Exec / Eng / Marketing) from the
 * pre-fetched server payload so switching views is instantaneous (<10ms)
 * without triggering a full server `router.refresh()` round-trip.
 */
export function WorkspaceDashboardClient({
  workspace,
  userId,
  userName,
  myRole,
  planName,
  initialView,
}: WorkspaceDashboardClientProps) {
  const [activeView, setActiveView] = useState<DashboardView>(initialView);

  useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  const dashboardProps = { workspace, userId, userName };
  const roleDashboard =
    activeView === "exec" ? <ExecDashboard {...dashboardProps} /> :
    activeView === "eng" ? <EngDashboard {...dashboardProps} /> :
    activeView === "marketing" ? <MarketingDashboard {...dashboardProps} /> :
    <PMDashboard {...dashboardProps} />;

  return (
    <>
      {/* Quick stats — omitted for PM view which already shows Active Goals & Team Members */}
      {activeView !== "pm" && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { icon: Users, label: "Members", value: workspace._count.members },
            { icon: Hash, label: "Goals", value: workspace._count.goals },
            { icon: CreditCard, label: "Plan", value: planName },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5 text-slate">
                <Icon size={14} aria-hidden="true" />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <div className="text-xl font-bold text-ink">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Role-tailored dashboard */}
      <section aria-label={`${ROLE_LABELS[activeView] ?? activeView} dashboard`}>
        {roleDashboard}
      </section>

      {/* Dashboard View Switcher (decoupled from RBAC role — instant client swap) */}
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <LayoutGrid size={16} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Dashboard view</h2>
          <span
            className={`ml-auto text-xs px-2.5 py-0.5 rounded-full font-semibold ${
              ROLE_BADGE_COLORS[myRole] ?? "bg-slate-100 text-slate-600"
            }`}
          >
            Your permission: {ROLE_LABELS[myRole] ?? myRole}
          </span>
        </div>
        <p className="text-sm text-slate mb-5">
          Switch between tailored dashboard layouts anytime. Changing your dashboard view only
          customizes what you see — it never alters your workspace permissions.
        </p>
        <DashboardViewSwitcher
          workspaceId={workspace.id}
          currentView={activeView}
          onViewChange={setActiveView}
          clientOnly
        />
      </section>
    </>
  );
}
