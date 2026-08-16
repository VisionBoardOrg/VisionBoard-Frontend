import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { WorkspacesClient } from "@/components/workspace/WorkspacesClient";
import { AppShell } from "@/components/layout/AppShell";

export const metadata = { title: "Workspaces — VisionBoard" };

export default async function WorkspacesPage() {
  const session = await auth();
  if (!session) redirect("/auth/login");

  // Get user and all workspaces the user is a member of
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, plan: true, aiCreditsUsed: true },
    }),
    prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      select: {
        role: true,
        joinedAt: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerId: true,
            owner: { select: { id: true, name: true, email: true, plan: true } },
            _count: { select: { members: true, goals: true, documents: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  // Owned workspace count for plan limit checks
  const ownedCount = memberships.filter(
    (m) => m.workspace.ownerId === session.user.id
  ).length;

  // Active workspace id for shell context
  const activeWorkspaceId = session.user.workspaceId ?? memberships[0]?.workspace.id ?? null;
  const activeMembership = memberships.find((m) => m.workspace.id === activeWorkspaceId);
  const activeWorkspace = activeMembership?.workspace;

  // Use the user's account plan
  const plan = user?.plan ?? "free";
  const limits = PLAN_LIMITS[plan];

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    plan: m.workspace.owner.plan ?? "free",
    role: m.role,
    isOwner: m.workspace.ownerId === session.user.id,
    ownerName: m.workspace.owner.name ?? m.workspace.owner.email,
    memberCount: m.workspace._count.members,
    goalCount: m.workspace._count.goals,
    docCount: m.workspace._count.documents,
    joinedAt: m.joinedAt.toISOString(),
  }));

  const workspaceLimit =
    limits.workspaces === "unlimited" || (limits.workspaces as number) < 0
      ? null
      : (limits.workspaces as number);

  return (
    <AppShell
      workspaceId={null}
      role={activeMembership?.role ?? session.user.role}
      plan={plan}
      aiCreditsUsed={user?.aiCreditsUsed ?? 0}
      aiCreditsMax={plan === "free" ? 10 : plan === "startup" ? 100 : -1}
      userId={session.user.id}
      isOwner={activeWorkspace?.ownerId === session.user.id}
    >
      <WorkspacesClient
        workspaces={workspaces}
        ownedCount={ownedCount}
        workspaceLimit={workspaceLimit}
        plan={plan}
        userId={session.user.id}
        inAppShell
      />
    </AppShell>
  );
}
