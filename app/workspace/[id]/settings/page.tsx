import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Suspense } from "react";
import { InviteMemberModal } from "@/components/settings/InviteMemberModal";
import { PendingInvitesList } from "@/components/settings/PendingInvitesList";
import {
  WorkspaceRenameInline,
  WorkspaceIdCopy,
  WorkspaceExportButton,
} from "@/components/settings/WorkspaceRenameInline";
import { InviteLinkSection } from "@/components/settings/InviteLinkSection";
import { BillingSection } from "@/components/settings/BillingSection";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { formatRoleLabel } from "@/lib/roles";
import {
  Users, Plug, Shield, ChevronRight,
  MessageSquare, GitBranch, Kanban, Layout, Layers, Building2, Download,
} from "lucide-react";

interface SettingsPageProps { params: Promise<{ id: string }> }

const INTEGRATIONS = [
  { name: "Slack", icon: MessageSquare, description: "Get notified when milestones update" },
  { name: "GitHub", icon: GitBranch, description: "Link PRs and issues to tasks" },
  { name: "Jira", icon: Kanban, description: "Sync Jira tickets with VisionBoard tasks" },
  { name: "Figma", icon: Layout, description: "Embed designs in connected docs" },
  { name: "Linear", icon: Layers, description: "Mirror Linear issues on the board" },
];

export default async function SettingsPage({ params }: SettingsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const [member, currentUser] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
      include: {
        workspace: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
                plan: true,
                aiCreditsUsed: true,
                stripeCustomerId: true,
                stripeCurrentPeriodEnd: true,
                stripeCancelAtPeriodEnd: true,
              },
            },
            members: { include: { user: { select: { id: true, name: true, email: true, image: true } } } },
            invites: { where: { status: "pending" }, orderBy: { createdAt: "desc" } },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, aiCreditsUsed: true },
    }),
  ]);
  if (!member || !currentUser) redirect("/dashboard");

  // Auto-correct: workspace owner must always have admin role.
  if (member.workspace.ownerId === session.user.id && member.role !== "admin") {
    prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
      data: { role: "admin" },
    }).catch((err) => console.error("[settings] owner-role auto-correct failed:", err));
    member.role = "admin";
  }

  const workspace = member.workspace;
  // Workspace limits and billing always follow the workspace owner's plan, never the viewer's plan.
  const ownerPlan = workspace.owner.plan;
  const limits = PLAN_LIMITS[ownerPlan];
  const isOwner = workspace.ownerId === session.user.id;
  const canManage = isOwner || member.role === "admin" || member.role === "pm";
  const canManageInviteLink = isOwner || member.role === "admin";
  const canRename = isOwner || member.role === "admin";

  const pendingInvites = workspace.invites
    .filter((inv) => inv.email !== "__invite_link__")
    .map((inv) => ({
      id: inv.id, email: inv.email, role: inv.role,
      token: inv.token, createdAt: inv.createdAt.toISOString(),
    }));

  const openInvite = workspace.invites.find((inv) => inv.email === "__invite_link__");
  const openInviteToken = canManageInviteLink ? (openInvite?.token ?? null) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Workspace Settings</h1>
        <p className="text-slate text-sm mt-1">{workspace.name}</p>
      </div>

      {/* ── Workspace identity ── */}
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-5">
          <Building2 size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Workspace</h2>
        </div>
        <WorkspaceRenameInline
          workspaceId={id}
          currentName={workspace.name}
          canRename={canRename}
        />
        <WorkspaceIdCopy workspaceId={id} />
      </section>

      {/* ── Team Members ── */}
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-5">
          <Users size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Team Members</h2>
          <span className="ml-auto text-xs text-muted">
            {workspace.members.length + pendingInvites.length}
            {" / "}
            {(limits.members as number) < 0 || limits.members === null ? "∞" : limits.members}
          </span>
        </div>

        <div className="space-y-2">
          {workspace.members.map((m) => {
            const isSelf = m.userId === session.user.id;
            return (
              <div key={m.userId} className="flex items-center gap-3 p-3 rounded-xl bg-offwhite">
                <div className="w-8 h-8 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold text-sm uppercase shrink-0">
                  {m.user.name?.[0] ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {m.user.name}{isSelf && <span className="text-muted font-normal ml-1">(you)</span>}
                  </div>
                  <div className="text-xs text-muted truncate">{m.user.email}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-faint text-blue font-medium shrink-0">
                  {formatRoleLabel(m.role)}
                </span>
              </div>
            );
          })}
        </div>

        <PendingInvitesList
          workspaceId={id}
          invites={pendingInvites}
          canManage={canManage}
        />

        {canManage ? (
          <div className="mt-5 pt-5 border-t border-border">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-ink">Invite teammates</p>
                <p className="text-xs text-muted mt-0.5">
                  They&apos;ll receive an email with a join link.
                  {typeof limits.members === "number" && (limits.members as number) > 0 && (
                    <> Plan limit: <strong>{limits.members} members</strong>.</>
                  )}
                </p>
              </div>
            </div>
            <InviteMemberModal
              workspaceId={id}
              currentMemberCount={workspace.members.length + pendingInvites.length}
              memberLimit={limits.members}
            />
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">
            Only admins and product managers can invite members.
          </p>
        )}

        <div className="mt-5 pt-5 border-t border-border">
          <InviteLinkSection
            workspaceId={id}
            initialToken={openInviteToken}
            canManageInviteLink={canManageInviteLink}
          />
        </div>
      </section>

      {/* ── Plan & Billing (owner-scoped) ── */}
      <Suspense fallback={<div className="bg-white rounded-2xl border border-border p-6 h-48 animate-pulse" />}>
        <BillingSection
          workspaceId={id}
          plan={ownerPlan}
          limits={limits}
          canManageBilling={isOwner}
          workspaceOwnerName={workspace.owner.name ?? workspace.owner.email}
          stripeCustomerId={workspace.owner.stripeCustomerId ?? null}
          stripeCurrentPeriodEnd={workspace.owner.stripeCurrentPeriodEnd?.toISOString() ?? null}
          stripeCancelAtPeriodEnd={workspace.owner.stripeCancelAtPeriodEnd}
          aiCreditsUsed={currentUser.aiCreditsUsed}
        />
      </Suspense>

      {/* ── Integrations ── */}
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-5">
          <Plug size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Integrations</h2>
          <span className="ml-auto text-xs bg-offwhite border border-border text-muted px-2.5 py-0.5 rounded-full">
            Coming soon
          </span>
        </div>
        <div className="space-y-3">
          {INTEGRATIONS.map(({ name, icon: Icon, description }) => (
            <div key={name} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border border-border">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue/10 text-blue flex items-center justify-center shrink-0">
                  <Icon size={18} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-ink text-sm">{name}</div>
                  <div className="text-xs text-muted">{description}</div>
                </div>
              </div>
              <span className="text-xs text-muted bg-offwhite border border-border px-2.5 py-1 rounded-full self-start sm:self-auto shrink-0">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── SSO ── */}
      <section className="bg-white rounded-2xl border border-border p-6 opacity-75">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={18} className="text-muted" aria-hidden="true" />
          <h2 className="font-semibold text-ink">SSO / SAML</h2>
          <span className="ml-auto text-xs bg-violet-50 border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full">
            Enterprise only
          </span>
        </div>
        <p className="text-sm text-muted">
          Single Sign-On with Okta, Azure AD, or Google Workspace. Available on Enterprise plan.
        </p>
        <a href="mailto:sales@vision-board.tech" className="mt-3 inline-flex items-center gap-1 text-sm text-blue hover:underline">
          Contact sales <ChevronRight size={13} aria-hidden="true" />
        </a>
      </section>

      {/* ── Workspace Data Export ── */}
      <section className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download size={18} className="text-blue" aria-hidden="true" />
          <h2 className="font-semibold text-ink">Export Workspace Data</h2>
        </div>
        <WorkspaceExportButton workspaceId={id} workspaceName={workspace.name} />
      </section>

    </div>
  );
}
