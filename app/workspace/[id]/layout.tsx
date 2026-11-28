import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import {
  getUserWorkspaceMemberships,
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
  const [session, { id }] = await Promise.all([auth(), params]);
  if (!session) redirect("/auth/login");
  const userId = session.user.id;

  const [memberships, currentUser] = await Promise.all([
    getUserWorkspaceMemberships(userId),
    getUserPlanAndCredits(userId),
  ]);

  const member = memberships.find((m) => m.workspaceId === id) ?? null;
  if (!member || !currentUser) redirect("/dashboard");

  const isOwner = member.workspace.ownerId === userId;
  const workspaceOwnerPlan = isOwner
    ? currentUser.plan
    : member.workspace.owner.plan;
  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
  }));

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
      emailVerified={session.user.emailVerified}
      isOwner={isOwner}
    >
      {children}
    </AppShell>
  );
}
