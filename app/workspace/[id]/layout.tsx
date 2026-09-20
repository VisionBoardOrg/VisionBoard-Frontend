import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
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

  // Two parallel queries, each deduped (React.cache within request,
  // process-level inflight+TTL across requests). If workspace sub-page also
  // calls getUserPlanAndCredits or getSlimWorkspaceMembership below, it gets
  // the already-computed value — zero extra DB round-trips.
  const [member, currentUser] = await Promise.all([
    getSlimWorkspaceMembership(id, userId),
    getUserPlanAndCredits(userId),
  ]);

  if (!member || !currentUser) redirect("/dashboard");

  const plan = currentUser.plan;
  const isOwner = member.workspace.ownerId === userId;

  return (
    <AppShell
      workspaceId={id}
      role={session.user.role}
      plan={plan}
      aiCreditsUsed={currentUser.aiCreditsUsed}
      aiCreditsMax={PLAN_LIMITS[plan].aiCreditsPerMonth ?? -1}
      userId={userId}
      isOwner={isOwner}
    >
      {children}
    </AppShell>
  );
}
