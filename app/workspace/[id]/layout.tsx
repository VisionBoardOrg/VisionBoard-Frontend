import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import {
  getSlimWorkspaceMembership,
  getUserPlanAndCredits,
} from "@/lib/workspace-data";

interface WorkspaceLayoutProps {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function WorkspaceLayout({
  params,
  children,
}: WorkspaceLayoutProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;
  const userId = session.user.id;

  const [member, currentUser, memberships] = await Promise.all([
    getSlimWorkspaceMembership(id, userId),
    getUserPlanAndCredits(userId),
    prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspace: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  if (!member || !currentUser) redirect("/dashboard");

  const isOwner = member.workspace.ownerId === userId;
  const ownerPlanData = isOwner
    ? currentUser
    : await getUserPlanAndCredits(member.workspace.ownerId);

  const workspaceOwnerPlan = ownerPlanData?.plan ?? currentUser.plan;
  const workspaces = memberships.map((m) => m.workspace);

  return (
    <AppShell
      workspaceId={id}
      workspaceName={member.workspace.name}
      workspaces={workspaces}
      role={member.role}
      plan={workspaceOwnerPlan}
      aiCreditsUsed={currentUser.aiCreditsUsed}
      aiCreditsMax={PLAN_LIMITS[workspaceOwnerPlan].aiCreditsPerMonth ?? -1}
      userId={userId}
      userName={session.user.name}
      userEmail={session.user.email}
      userImage={session.user.image}
      isOwner={isOwner}
    >
      {children}
    </AppShell>
  );
}
