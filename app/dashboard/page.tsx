import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ArrowRight, Kanban } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { formatRoleLabel } from "@/lib/roles";
import { UserSummaryCards } from "@/components/dashboard/UserSummaryCards";
import { AppShell } from "@/components/layout/AppShell";
import { getUserPlanAndCredits } from "@/lib/workspace-data";

export const metadata = {
  title: "Dashboard — VisionBoard",
  robots: { index: false, follow: false },
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  startup: "Startup",
  growth: "Growth",
  enterprise: "Enterprise",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  // Fetch user plan, workspace memberships, and cross-workspace assigned task
  // status counts in a single parallel wave (collapsed from a 2-step waterfall).
  const [user, userMemberships, taskStatusGroups] = await Promise.all([
    getUserPlanAndCredits(session.user.id),
    prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            ownerId: true,
            owner: { select: { plan: true } },
            _count: { select: { members: true, goals: true, documents: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.$queryRaw<Array<{ status: string; count: number }>>`
      SELECT t."status"::text AS status, COUNT(*)::int AS count
      FROM "Task" t
      INNER JOIN "TaskAssignment" ta ON ta."taskId" = t."id"
      WHERE ta."userId" = ${session.user.id}
      GROUP BY t."status"
    `,
  ]);

  if (userMemberships.length === 0) redirect("/onboarding");

  // Primary workspace
  const primaryWorkspace = userMemberships[0].workspace;
  const plan = user?.plan ?? "free";

  // Compute cross-workspace user summary stats from database aggregation
  const totalWorkspaces = userMemberships.length;
  let totalAssigned = 0;
  let totalDone = 0;
  for (const group of taskStatusGroups) {
    const count = Number(group.count) || 0;
    totalAssigned += count;
    if (group.status === "done") {
      totalDone += count;
    }
  }
  const completionRate = totalAssigned > 0 ? (totalDone / totalAssigned) * 100 : 0;

  // User display name with email fallback
  const userDisplayName =
    (session.user.name?.trim() || "") !== "" ? session.user.name! : session.user.email ?? "";
  const firstName = session.user.name?.trim().split(/\s+/)[0] || userDisplayName;
  const userEmail = session.user.email ?? "";

  return (
    <AppShell
      workspaceId={null}
      role={session.user.role}
      plan={plan}
      aiCreditsUsed={user?.aiCreditsUsed ?? 0}
      aiCreditsMax={PLAN_LIMITS[plan].aiCreditsPerMonth ?? -1}
      userId={session.user.id}
      userName={session.user.name}
      userEmail={session.user.email}
      userImage={session.user.image}
      isOwner={primaryWorkspace.ownerId === session.user.id}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Welcome back, {firstName}
          </h1>
          <p className="text-slate text-sm mt-1">
            Here&apos;s an overview of your workspaces and assigned tasks.
          </p>
        </div>

        {/* Aggregate Stats */}
        <UserSummaryCards
          userName={userDisplayName}
          userEmail={userEmail}
          userImage={session.user.image}
          workspaceCount={totalWorkspaces}
          assignedTaskCount={totalAssigned}
          completionRate={completionRate}
        />

        {/* Workspaces Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink">Your Workspaces</h2>
            <Link
              href="/workspaces"
              className="text-xs font-semibold text-blue hover:underline"
            >
              Manage all
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {userMemberships.map((m) => (
              <div
                key={m.workspace.id}
                className="relative bg-white rounded-2xl border border-border p-5 flex flex-col justify-between space-y-4 hover:border-blue/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-faint flex items-center justify-center text-blue shrink-0 font-bold">
                    <Building2 size={20} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink group-hover:text-blue transition-colors truncate">
                      <Link
                        href={`/workspace/${m.workspace.id}/workspace`}
                        className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:underline"
                      >
                        {m.workspace.name}
                      </Link>
                    </h3>
                    <p className="text-xs text-slate mt-0.5 truncate">
                      {formatRoleLabel(m.role)} · {PLAN_LABELS[m.workspace.owner.plan] ?? m.workspace.owner.plan} plan
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/60 text-xs text-slate">
                  <span>
                    {m.workspace._count.members} member{m.workspace._count.members !== 1 ? "s" : ""} · {m.workspace._count.goals} goal{m.workspace._count.goals !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href={`/workspace/${m.workspace.id}/board`}
                      className="relative z-10 inline-flex items-center gap-1 text-slate hover:text-blue font-medium transition-colors"
                    >
                      <Kanban size={12} aria-hidden="true" />
                      Board
                    </Link>
                    <span className="font-semibold text-blue inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform" aria-hidden="true">
                      Overview <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
