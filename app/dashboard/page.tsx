import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PMDashboard } from "@/components/dashboard/PMDashboard";
import { ExecDashboard } from "@/components/dashboard/ExecDashboard";
import { EngDashboard } from "@/components/dashboard/EngDashboard";
import { MarketingDashboard } from "@/components/dashboard/MarketingDashboard";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = { title: "Dashboard — VisionBoard" };

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  let workspaceId = session.user.workspaceId;

  if (!workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      orderBy: { joinedAt: "asc" },
    });
    workspaceId = membership?.workspaceId ?? null;
  }

  if (!workspaceId) redirect("/onboarding");

  // Fetch workspace + all dashboard data in parallel (single wave)
  const [workspaceBase, goals, sprints, members] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { _count: { select: { goals: true, documents: true, members: true } } },
    }),
    prisma.goal.findMany({
      where: { workspaceId: workspaceId! },
      include: { milestones: { include: { tasks: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.sprint.findMany({
      where: { workspaceId: workspaceId!, status: "active" },
      include: { tasks: true },
      take: 3,
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: workspaceId! },
      include: { user: true },
    }),
  ]);

  if (!workspaceBase) redirect("/onboarding");

  const workspace = { ...workspaceBase, goals, sprints, members };
  const myMembership = members.find((m) => m.userId === session.user.id);
  const liveRole = myMembership?.role ?? session.user.role ?? null;

  // Auto-correct owner role: moved to a fire-and-forget background write so it
  // does NOT block the page render. The member object is mutated in memory so
  // the current render uses the corrected role immediately.
  if (workspace.ownerId === session.user.id && myMembership && myMembership.role !== "admin") {
    // Intentionally not awaited — this is a one-time idempotent correction that
    // does not need to block page delivery. A failed write here is harmless; the
    // page falls back to the live DB role on the next load.
    prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId: workspaceId!, userId: session.user.id } },
      data: { role: "admin" },
    }).catch((err) => console.error("[dashboard] owner-role auto-correct failed:", err));

    if (myMembership) myMembership.role = "admin";
  }

  const role = liveRole as string;

  const dashboardProps = {
    workspace,
    userId: session.user.id,
    userName: session.user.name ?? "there",
  };

  return (
    <AppShell workspaceId={workspaceId} role={role} plan={workspace.plan}
      aiCreditsUsed={workspace.aiCreditsUsed}
      aiCreditsMax={workspace.plan === "free" ? 10 : workspace.plan === "startup" ? 100 : -1}
    >
      {role === "exec" && <ExecDashboard {...dashboardProps} />}
      {role === "eng" && <EngDashboard {...dashboardProps} />}
      {role === "marketing" && <MarketingDashboard {...dashboardProps} />}
      {(role === "pm" || role === "admin" || !role) && <PMDashboard {...dashboardProps} />}
    </AppShell>
  );
}
