import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { UserSummaryCards } from "@/components/dashboard/UserSummaryCards";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = { title: "Dashboard — VisionBoard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  // Fetch cross-workspace user stats, memberships, and user plan in parallel
  const [user, userMemberships, assignedTasks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, plan: true, aiCreditsUsed: true },
    }),
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
    prisma.task.findMany({
      where: { assigneeId: session.user.id },
      select: { id: true, status: true },
    }),
  ]);

  if (userMemberships.length === 0) redirect("/onboarding");

  // Primary workspace
  const primaryWorkspace = userMemberships[0].workspace;
  const plan = user?.plan ?? "free";

  // Compute cross-workspace user summary stats
  const totalWorkspaces = userMemberships.length;
  const totalAssigned = assignedTasks.length;
  const totalDone = assignedTasks.filter((t) => t.status === "done").length;
  const completionRate = totalAssigned > 0 ? (totalDone / totalAssigned) * 100 : 0;

  // User display name with email fallback
  const userDisplayName =
    (session.user.name?.trim() || "") !== "" ? session.user.name! : session.user.email ?? "";
  const userEmail = session.user.email ?? "";

  return (
    <AppShell
      workspaceId={null}
      role={session.user.role}
      plan={plan}
      aiCreditsUsed={user?.aiCreditsUsed ?? 0}
      aiCreditsMax={plan === "free" ? 10 : plan === "startup" ? 100 : -1}
      userId={session.user.id}
      isOwner={primaryWorkspace.ownerId === session.user.id}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Welcome Section */}
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Welcome back, {userDisplayName}
          </h1>
          <p className="text-slate text-sm mt-1">
            Signed in as <span className="font-semibold text-ink">{userEmail}</span>
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
                className="bg-white rounded-2xl border border-border p-5 flex flex-col justify-between space-y-4 hover:border-blue/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-faint flex items-center justify-center text-blue shrink-0 font-bold">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-ink group-hover:text-blue transition-colors truncate">
                      {m.workspace.name}
                    </h3>
                    <p className="text-xs text-slate capitalize mt-0.5">
                      Role: {m.role} • {m.workspace.owner.plan} plan
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-slate">
                  <span>{m.workspace._count.members} member{m.workspace._count.members !== 1 ? "s" : ""}</span>
                  <Link
                    href={`/workspace/${m.workspace.id}/board`}
                    className="font-semibold text-blue flex items-center gap-1 hover:underline"
                  >
                    Open Workspace <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
