import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { InviteMemberModal } from "@/components/settings/InviteMemberModal";
import { PendingInvitesList } from "@/components/settings/PendingInvitesList";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import Link from "next/link";
import { Users, CreditCard, Plug, Shield, ChevronRight, MessageSquare, GitBranch, Kanban, Layout, Layers, Check, X } from "lucide-react";

interface SettingsPageProps { params: Promise<{ id: string }> }

const INTEGRATIONS = [
  { name: "Slack", icon: MessageSquare, description: "Get notified when milestones update", tier: "growth" },
  { name: "GitHub", icon: GitBranch, description: "Link PRs and issues to tasks", tier: "growth" },
  { name: "Jira", icon: Kanban, description: "Sync Jira tickets with VisionBoard tasks", tier: "growth" },
  { name: "Figma", icon: Layout, description: "Embed designs in connected docs", tier: "growth" },
  { name: "Linear", icon: Layers, description: "Mirror Linear issues on the board", tier: "growth" },
];

export default async function SettingsPage({ params }: SettingsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    include: {
      workspace: {
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
          invites: { where: { status: "pending" }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!member) redirect("/dashboard");

  const workspace = member.workspace;
  const pendingInvites = workspace.invites.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    token: inv.token,
    createdAt: inv.createdAt.toISOString(),
  }));
  const plan = workspace.plan;
  const limits = PLAN_LIMITS[plan];
  const canManage = member.role === "admin" || member.role === "pm";

  const TIER_NAMES = { free: "Free", startup: "Startup", growth: "Growth", enterprise: "Enterprise" };
  const TIER_COLORS = { free: "bg-muted text-white", startup: "bg-cyan text-white", growth: "bg-blue text-white", enterprise: "bg-violet-600 text-white" };

  return (
    <AppShell workspaceId={id} role={session.user.role} plan={plan}>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Settings</h1>
          <p className="text-slate text-sm mt-1">{workspace.name}</p>
        </div>

        {/* Members */}
        <section className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <Users size={18} className="text-blue" />
            <h2 className="font-semibold text-ink">Team Members</h2>
            <span className="ml-auto text-xs text-muted">
              {workspace.members.length + pendingInvites.length} / {limits.members === "unlimited" ? "∞" : limits.members}
            </span>
          </div>
          <div className="space-y-3">
            {workspace.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 p-3 rounded-xl bg-offwhite">
                <div className="w-8 h-8 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold text-sm uppercase">
                  {m.user.name?.[0] ?? "?"}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">{m.user.name}</div>
                  <div className="text-xs text-muted">{m.user.email}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-faint text-blue font-medium capitalize">{m.role}</span>
              </div>
            ))}
          </div>

          <PendingInvitesList workspaceId={id} invites={pendingInvites} />

          {canManage && (
            <InviteMemberModal
              workspaceId={id}
              currentMemberCount={workspace.members.length + pendingInvites.length}
              memberLimit={limits.members}
            />
          )}
        </section>

        {/* Billing */}
        <section className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <CreditCard size={18} className="text-blue" />
            <h2 className="font-semibold text-ink">Plan & Billing</h2>
          </div>

          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold mb-5 ${TIER_COLORS[plan]}`}>
            {TIER_NAMES[plan]} Plan
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {([
              ["Workspaces", limits.workspaces === "unlimited" ? "Unlimited" : limits.workspaces],
              ["Team members", limits.members === "unlimited" ? "Unlimited" : limits.members],
              ["AI credits/mo", limits.aiCreditsPerMonth === "unlimited" ? "Unlimited" : limits.aiCreditsPerMonth],
              ["Activity log", typeof limits.activityLogDays === "number" && limits.activityLogDays === -1 ? "Forever" : `${limits.activityLogDays} days`],
              ["Timeline/Gantt", limits.timelineGantt],
              ["Sprint tracking", limits.sprintTracking],
              ["Integrations", limits.integrations],
              ["SSO/SAML", limits.sso],
            ] as [string, string | number | boolean][]).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between bg-offwhite rounded-xl px-4 py-2.5 text-sm">
                <span className="text-slate">{label}</span>
                {typeof value === "boolean" ? (
                  value ? <Check size={16} className="text-emerald-600" /> : <X size={16} className="text-slate-400" />
                ) : (
                  <span className="font-semibold text-ink">{String(value)}</span>
                )}
              </div>
            ))}
          </div>

          {plan !== "enterprise" && (
            <div className="bg-blue-faint border border-blue-light rounded-xl p-4">
              <h3 className="font-semibold text-ink text-sm mb-1">Ready to upgrade?</h3>
              <p className="text-xs text-slate mb-3">Unlock more AI credits, unlimited workspaces, integrations, and priority support.</p>
              <a href="/pricing" className="inline-flex items-center gap-1 bg-blue text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-mid transition-colors">
                View pricing <ChevronRight size={14} />
              </a>
            </div>
          )}
        </section>

        {/* Integrations */}
        <section className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-5">
            <Plug size={18} className="text-blue" />
            <h2 className="font-semibold text-ink">Integrations</h2>
            {!limits.integrations && (
              <span className="ml-auto text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">Growth plan required</span>
            )}
          </div>
          <div className="space-y-3">
            {INTEGRATIONS.map((integration) => {
              const Icon = integration.icon;
              return (
                <div key={integration.name} className="flex items-center gap-4 p-4 rounded-xl border border-border">
                  <div className="w-9 h-9 rounded-xl bg-blue/10 text-blue flex items-center justify-center shrink-0">
                    <Icon size={18} />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-ink text-sm">{integration.name}</div>
                    <div className="text-xs text-muted">{integration.description}</div>
                  </div>
                  <span className="text-xs text-muted bg-offwhite border border-border px-2.5 py-1 rounded-full">Coming soon</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* SSO */}
        <section className="bg-white rounded-2xl border border-border p-6 opacity-75">
          <div className="flex items-center gap-2 mb-3">
            <Shield size={18} className="text-muted" />
            <h2 className="font-semibold text-ink">SSO / SAML</h2>
            <span className="ml-auto text-xs bg-violet-50 border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full">Enterprise only</span>
          </div>
          <p className="text-sm text-muted">Single Sign-On with your identity provider (Okta, Azure AD, Google Workspace). Available on Enterprise plan.</p>
          <a href="mailto:sales@visionboard.app" className="mt-3 inline-flex items-center gap-1 text-sm text-blue hover:underline">
            Contact sales <ChevronRight size={13} />
          </a>
        </section>
      </div>
    </AppShell>
  );
}
