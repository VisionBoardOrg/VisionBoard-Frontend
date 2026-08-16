import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cache } from "react";
import { RoleSwitcher, type MemberRole } from "@/components/workspace/RoleSwitcher";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import Link from "next/link";
import {
  Building2, Users, CreditCard, ChevronRight,
  Crown, Hash
} from "lucide-react";

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
  pm: { label: "Product Manager", color: "bg-blue-faint text-blue" },
  exec: { label: "Executive", color: "bg-violet-50 text-violet-700" },
  eng: { label: "Engineering", color: "bg-cyan-50 text-cyan-700" },
  marketing: { label: "Marketing", color: "bg-amber-50 text-amber-600" },
  admin: { label: "Admin", color: "bg-emerald-50 text-emerald-600" },
};

/**
 * React.cache() deduplicates this query within a single request so both
 * generateMetadata and the page component share the same DB call.
 */
const getWorkspaceName = cache((id: string) =>
  prisma.workspace.findUnique({ where: { id }, select: { name: true } })
);

export async function generateMetadata({ params }: WorkspacePageProps) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Workspace — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // Member lookup with full workspace includes and currentUser plan
  const [member, currentUser] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
      include: {
        workspace: {
          include: {
            owner: { select: { id: true, name: true, email: true, plan: true } },
            members: {
              include: { user: { select: { id: true, name: true, email: true, image: true } } },
              orderBy: { joinedAt: "asc" },
            },
            _count: { select: { goals: true, documents: true } },
          },
        },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, aiCreditsUsed: true },
    }),
  ]);

  if (!member || !currentUser) redirect("/dashboard");

  const workspace = member.workspace;
  const plan = currentUser.plan;
  const limits = PLAN_LIMITS[plan];
  const myRole = member.role as MemberRole;
  const isAdmin = myRole === "admin";
  const isOwner = workspace.ownerId === session.user.id;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-faint flex items-center justify-center shrink-0">
            <Building2 size={22} className="text-blue" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-ink">{workspace.name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${PLAN_COLORS[plan] ?? "bg-slate-100 text-slate-700"}`}>
                {PLAN_NAMES[plan] ?? plan}
              </span>
            </div>
            <p className="text-sm text-slate mt-0.5">Workspace ID: <span className="font-mono text-xs">{id}</span></p>
          </div>
          <Link
            href={`/workspace/${id}/settings`}
            className="shrink-0 flex items-center gap-1.5 text-xs text-blue hover:underline"
          >
            Settings <ChevronRight size={13} />
          </Link>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { icon: Users, label: "Members", value: workspace.members.length },
            { icon: Hash, label: "Goals", value: workspace._count.goals },
            { icon: CreditCard, label: "Plan", value: PLAN_NAMES[plan] ?? plan },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-slate">
                <Icon size={14} />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <div className="text-xl font-bold text-ink">{value}</div>
            </div>
          ))}
        </div>

        {/* Your role in this workspace */}
        <section className="bg-white rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-2">
            <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ROLE_META[myRole]?.color ?? "bg-slate-100 text-slate-600"}`}>
              {ROLE_META[myRole]?.label ?? myRole}
            </div>
            {isOwner && (
              <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                <Crown size={11} /> Owner
              </div>
            )}
          </div>
          <h2 className="font-semibold text-ink mb-1">Your role in this workspace</h2>
          <p className="text-sm text-slate mb-6">
            Your role controls which dashboard view and features you see. You can change it
            anytime — useful when you hold a different position across workspaces.
          </p>
          <RoleSwitcher
            workspaceId={id}
            currentRole={myRole}
            isAdmin={isAdmin}
            userId={session.user.id}
            isOwner={isOwner}
          />
        </section>

        {/* Team roster — admin can change others' roles */}
        {isAdmin && (
          <section className="bg-white rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users size={18} className="text-blue" />
              <h2 className="font-semibold text-ink">Team — Manage Roles</h2>
              <span className="ml-auto text-xs text-muted">
                {workspace.members.length} / {limits.members === "unlimited" || (limits.members as number) < 0 ? "∞" : limits.members}
              </span>
            </div>
            <div className="space-y-3">
              {workspace.members.map((m) => {
                const memberRole = m.role as MemberRole;
                const meta = ROLE_META[memberRole];
                const isSelf = m.userId === session.user.id;
                return (
                  <details key={m.userId} className="group rounded-xl border border-border overflow-hidden">
                    <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-offwhite transition-colors list-none">
                      <div className="w-8 h-8 rounded-full bg-blue-light flex items-center justify-center text-blue font-bold text-sm uppercase shrink-0">
                        {m.user.name?.[0] ?? "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink truncate">
                          {m.user.name}{isSelf && <span className="text-muted font-normal ml-1">(you)</span>}
                        </div>
                        <div className="text-xs text-muted truncate">{m.user.email}</div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta?.color ?? "bg-slate-100 text-slate-600"}`}>
                        {meta?.label ?? memberRole}
                      </span>
                      <ChevronRight size={14} className="text-muted group-open:rotate-90 transition-transform ml-1 shrink-0" />
                    </summary>
                    <div className="border-t border-border px-4 py-4 bg-offwhite/40">
                      <RoleSwitcher
                        workspaceId={id}
                        currentRole={memberRole}
                        isAdmin={isAdmin}
                        targetUserId={isSelf ? undefined : m.userId}
                        targetName={isSelf ? undefined : m.user.name ?? m.user.email}
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
            <Crown size={16} className="text-amber-500" />
            <h2 className="font-semibold text-ink">Workspace Owner</h2>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-offwhite">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-sm uppercase">
              {workspace.owner.name?.[0] ?? "?"}
            </div>
            <div>
              <div className="text-sm font-medium text-ink">{workspace.owner.name}</div>
              <div className="text-xs text-muted">{workspace.owner.email}</div>
            </div>
          </div>
        </section>

        {/* Upgrade CTA for non-enterprise */}
        {plan !== "enterprise" && (
          <section className="bg-blue-faint border border-blue-light rounded-2xl p-6 flex items-center gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-ink mb-1">Upgrade your plan</h3>
              <p className="text-sm text-slate">
                Unlock more AI credits, unlimited members, integrations, and priority support.
              </p>
            </div>
            <a
              href="/pricing"
              className="shrink-0 inline-flex items-center gap-1 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
            >
              View plans <ChevronRight size={14} />
            </a>
          </section>
        )}
      </div>
  );
}
