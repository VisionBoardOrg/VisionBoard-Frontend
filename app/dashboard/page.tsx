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

  // Redirect to onboarding if user has no workspace
  if (!workspaceId) redirect("/onboarding");

  // Fetch workspace data for dashboard
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      goals: {
        include: {
          milestones: {
            include: { tasks: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      sprints: {
        where: { status: "active" },
        include: { tasks: true },
        take: 3,
      },
      members: { include: { user: true } },
      _count: { select: { goals: true, documents: true, members: true } },
    },
  });

  if (!workspace) redirect("/onboarding");

  // Auto-correct: if this user is the workspace owner but their member role
  // isn't admin (created before the enforce-admin-on-create rule), fix it now.
  if (workspace.ownerId === session.user.id) {
    const myMember = workspace.members.find((m) => m.userId === session.user.id);
    if (myMember && myMember.role !== "admin") {
      await prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: workspaceId!, userId: session.user.id } },
        data: { role: "admin" },
      });
    }
  }

  const role = session.user.role as string;

  const dashboardProps = {
    workspace,
    userId: session.user.id,
    userName: session.user.name ?? "there",
  };

  return (
    <AppShell workspaceId={workspaceId} role={role} plan={workspace.plan}>
      {role === "exec" && <ExecDashboard {...dashboardProps} />}
      {role === "eng" && <EngDashboard {...dashboardProps} />}
      {role === "marketing" && <MarketingDashboard {...dashboardProps} />}
      {(role === "pm" || role === "admin" || !role) && <PMDashboard {...dashboardProps} />}
    </AppShell>
  );
}
