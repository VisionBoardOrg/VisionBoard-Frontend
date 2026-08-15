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

  // Fetch cross-workspace user stats & workspace memberships in parallel
  const [userMemberships, assignedTasks] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            plan: true,
            aiCreditsUsed: true,
            ownerId: true,
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

  // Primary workspace for default billing/credit limits check
  const primaryWorkspace = userMemberships[0].workspace;

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
      plan={primaryWorkspace.plan}
      aiCreditsUsed={primaryWorkspace.aiCreditsUsed}
      aiCreditsMax={primaryWorkspace.plan === "free" ? 10 : primaryWorkspace.plan === "startup" ? 100 : -1}
      userId={session.user.id}
      isOwner={primaryWorkspace.ownerId === session.user.id}
    >
      <div className="space-y-8">
        {/* ── Personal Summary ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                Personal Overview
              </h2>
            </div>
          </div>
          <UserSummaryCards
            userName={userDisplayName}
            userEmail={userEmail}
            userImage={session.user.image}
            workspaceCount={totalWorkspaces}
            assignedTaskCount={totalAssigned}
            completionRate={completionRate}
          />
        </section>

        {/* ── Select Workspace to Work On ── */}
        <section className="space-y-4 pt-2 border-t border-border/80">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-ink">Your Workspaces</h2>
              <p className="text-xs text-slate mt-0.5">Select a workspace below to access its board, goals, roadmap, and team tools.</p>
            </div>
            <Link
              href="/workspaces"
              className="text-xs text-blue font-semibold hover:underline flex items-center gap-1"
            >
              Manage workspaces <ArrowRight size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      Role: {m.role} • {m.workspace.plan} plan
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
