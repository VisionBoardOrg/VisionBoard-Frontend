import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { WorkspacesClient } from "@/components/workspace/WorkspacesClient";

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

  // Use the first workspace's plan (or free if none)
  const plan =
    memberships.find((m) => m.workspace.ownerId === session.user.id)?.workspace.plan ?? "free";
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
    <WorkspacesClient
      workspaces={workspaces}
      ownedCount={ownedCount}
      workspaceLimit={workspaceLimit}
      plan={plan}
      userId={session.user.id}
    />
  );
}
