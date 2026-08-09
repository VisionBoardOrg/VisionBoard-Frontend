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

  // Get all workspaces the user is a member of
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: {
      workspace: {
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { members: true, goals: true, documents: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  // Owned workspace count for plan limit checks
  const ownedCount = memberships.filter(
    (m) => m.workspace.ownerId === session.user.id
  ).length;

  // Active workspace id for shell context
  const activeWorkspaceId = session.user.workspaceId ?? memberships[0]?.workspace.id ?? null;
  const activeMembership = memberships.find((m) => m.workspace.id === activeWorkspaceId);
  const activeWorkspace = activeMembership?.workspace;

  // Use the active workspace plan (or free if none)
  const plan = activeWorkspace?.plan ?? "free";
  const limits = PLAN_LIMITS[plan];

  const workspaces = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    plan: m.workspace.plan,
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
      aiCreditsUsed={activeWorkspace?.aiCreditsUsed}
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
