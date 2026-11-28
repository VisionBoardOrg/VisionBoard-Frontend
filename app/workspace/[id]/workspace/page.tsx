import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  RoleSwitcher,
  type MemberRole,
} from "@/components/workspace/RoleSwitcher";
import { WorkspaceDashboardClient } from "@/components/workspace/WorkspaceDashboardClient";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import {
  ROLE_LABELS,
  dashboardViewCookieName,
  resolveDashboardView,
} from "@/lib/roles";
import Link from "next/link";
import {
  Building2, Users, ChevronRight, Crown,
} from "lucide-react";
import {
  getSlimWorkspaceMembership,
  getWorkspaceName,
  getUserPlanAndCredits,
  getWorkspaceOverviewData,
} from "@/lib/workspace-data";
import type { DashboardWorkspace } from "@/types/dashboard";

interface WorkspacePageProps {
  params: Promise<{ id: string }>;
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-700",
  startup: "bg-cyan-50 text-cyan-700 border border-cyan-200",
  growth: "bg-blue-faint text-blue border border-blue-light",
  enterprise: "bg-violet-50 text-violet-700 border border-violet-200",
};

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  startup: "Startup",
  growth: "Growth",
  enterprise: "Enterprise",
};

const ROLE_META: Record<
  MemberRole,
  { label: string; color: string }
> = {
  pm: { label: ROLE_LABELS.pm, color: "bg-blue-faint text-blue" },
  exec: { label: ROLE_LABELS.exec, color: "bg-violet-50 text-violet-700" },
  eng: { label: ROLE_LABELS.eng, color: "bg-cyan-50 text-cyan-700" },
  marketing: { label: ROLE_LABELS.marketing, color: "bg-amber-50 text-amber-600" },
  admin: { label: ROLE_LABELS.admin, color: "bg-emerald-50 text-emerald-600" },
};

const VALID_ROLES = new Set<string>(["pm", "exec", "eng", "marketing", "admin"]);

export async function generateMetadata({ params }: WorkspacePageProps) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Workspace — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const [session, { id }, cookieStore] = await Promise.all([
    auth(),
    params,
    cookies(),
  ]);
  if (!session) redirect("/auth/login");

  const userId = session.user.id;
  const savedViewCookie = cookieStore.get(dashboardViewCookieName(id))?.value;

  const hintedRole: MemberRole =
    session.user.workspaceId === id &&
    session.user.role &&
    VALID_ROLES.has(session.user.role)
      ? (session.user.role as MemberRole)
      : "pm";
  const predictedFullMembers = hintedRole === "admin";

  // Single-SQL-CTE overview loader (getWorkspaceOverviewData) runs in parallel
  // with the cached layout membership + plan helpers (1 DB query instead of 4-5).
  const [member, currentUser, initialOverview] = await Promise.all([
    getSlimWorkspaceMembership(id, userId),
    getUserPlanAndCredits(userId),
    getWorkspaceOverviewData(id, userId, predictedFullMembers),
  ]);

  if (!member || !currentUser || !initialOverview) redirect("/dashboard");

  const myRole = member.role as MemberRole;
  const isAdmin = myRole === "admin";
  const dashboardView = resolveDashboardView(savedViewCookie, myRole);

  // If the JWT role hint wasn't admin yet (e.g. just promoted), re-fetch with full member list
  const workspace =
    isAdmin && !predictedFullMembers
      ? (await getWorkspaceOverviewData(id, userId, true)) ?? initialOverview
      : initialOverview;

  const dashboardWorkspace: DashboardWorkspace = {
    id: workspace.id,
    name: workspace.name,
    _count: workspace._count,
    members: workspace.members,
    goals: workspace.goals,
    taskStats: workspace.taskStats,
    myTasks: workspace.myTasks,
    myTasksTotal: workspace.myTasksTotal,
  };

  const plan = workspace.owner.plan;
  const limits = PLAN_LIMITS[plan];
  const isOwner = workspace.ownerId === session.user.id;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-faint flex items-center justify-center shrink-0">
          <Building2 size={22} className="text-blue" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-ink truncate">{workspace.name}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${PLAN_COLORS[plan] ?? "bg-slate-100 text-slate-700"}`}>
              {PLAN_NAMES[plan] ?? plan}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_META[myRole]?.color ?? "bg-slate-100 text-slate-600"}`}>
              {ROLE_META[myRole]?.label ?? myRole}
            </span>
            {isOwner && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                <Crown size={11} aria-hidden="true" /> Owner
              </span>
            )}
          </div>
        </div>
        <Link
          href={`/workspace/${id}/settings`}
          className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-blue hover:underline"
        >
          Settings <ChevronRight size={13} aria-hidden="true" />
        </Link>
      </div>

      {/* Client-side lens switcher + tailored dashboard (instant view switching, 0 server round-trips) */}
      <WorkspaceDashboardClient
        workspace={dashboardWorkspace}
        userId={session.user.id}
        userName={session.user.name ?? session.user.email ?? ""}
        myRole={myRole}
        planName={PLAN_NAMES[plan] ?? plan}
        initialView={dashboardView}
      />

      {/* Team roster — admin can change other non-owner members' roles */}
      {isAdmin && (
        <section className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users size={18} className="text-blue" aria-hidden="true" />
            <h2 className="font-semibold text-ink">Team — Manage Roles</h2>
            <span className="ml-auto text-xs text-muted">
              {workspace.members.length} / {limits.members === null || (limits.members as number) < 0 ? "∞" : limits.members}
            </span>
          </div>
          <div className="space-y-3">
            {workspace.members.map((m) => {
              const memberRole = m.role as MemberRole;
              const meta = ROLE_META[memberRole];
              const isSelf = m.userId === session.user.id;
              const isMemberOwner = m.userId === workspace.ownerId;
              const canEditMemberRole = !isSelf && !isMemberOwner;

              if (!canEditMemberRole) {
                return (
                  <div
                    key={m.userId}
                    className="flex items-center gap-3 p-4 rounded-xl border border-border bg-offwhite/30"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold text-sm uppercase shrink-0">
                      {m.user.name?.[0] ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">
                        {m.user.name}{isSelf && <span className="text-muted font-normal ml-1">(you)</span>}
                      </div>
                      <div className="text-xs text-muted truncate">{m.user.email}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMemberOwner && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                          <Crown size={11} aria-hidden="true" /> Owner
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta?.color ?? "bg-slate-100 text-slate-600"}`}>
                        {meta?.label ?? memberRole}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <details key={m.userId} className="group rounded-xl border border-border overflow-hidden">
                  <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-offwhite transition-colors list-none">
                    <div className="w-8 h-8 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold text-sm uppercase shrink-0">
                      {m.user.name?.[0] ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">
                        {m.user.name}
                      </div>
                      <div className="text-xs text-muted truncate">{m.user.email}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta?.color ?? "bg-slate-100 text-slate-600"}`}>
                      {meta?.label ?? memberRole}
                    </span>
                    <ChevronRight size={14} className="text-muted group-open:rotate-90 transition-transform ml-1 shrink-0" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-border px-4 py-4 bg-offwhite/40">
                    <RoleSwitcher
                      workspaceId={id}
                      currentRole={memberRole}
                      isAdmin={isAdmin}
                      isOwner={isOwner}
                      userId={session.user.id}
                      targetUserId={m.userId}
                      targetName={m.user.name ?? m.user.email}
                    />
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {/* Ownership */}
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Crown size={16} className="text-amber-500" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Workspace Owner</h2>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-offwhite">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm uppercase">
            {workspace.owner.name?.[0] ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{workspace.owner.name}</div>
            <div className="text-xs text-muted truncate">{workspace.owner.email}</div>
          </div>
        </div>
      </section>

      {/* Upgrade CTA for non-enterprise */}
      {plan !== "enterprise" && (
        <section className="bg-blue-faint border border-blue-light rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h2 className="font-semibold text-ink mb-1">Upgrade your plan</h2>
            <p className="text-sm text-slate">
              Unlock more AI credits, unlimited members, and priority support.
            </p>
          </div>
          <Link
            href="/pricing"
            className="shrink-0 inline-flex items-center justify-center gap-1 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
          >
            View plans <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </section>
      )}
    </div>
  );
}
