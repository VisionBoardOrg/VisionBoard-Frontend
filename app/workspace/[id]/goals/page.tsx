import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GoalsList } from "@/components/goals/GoalsList";
import { getSlimWorkspaceMembership, getWorkspaceName } from "@/lib/workspace-data";

interface GoalsPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: GoalsPageProps) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Goals — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function GoalsPage({ params }: GoalsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  // getSlimWorkspaceMembership is deduplicated with WorkspaceLayout via React.cache(),
  // and runs in parallel with the goals fetch to eliminate the sequential waterfall.
  const [member, goals] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    prisma.goal.findMany({
      where: { workspaceId: id },
      include: {
        milestones: {
          // Only fetch the minimal fields needed for progress/health rendering
          include: { tasks: { select: { id: true, status: true, storyPoints: true } } },
          orderBy: { order: "asc" },
        },
        _count: { select: { documents: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100, // safety cap — add pagination UI if workspaces exceed this
    }),
  ]);

  if (!member) redirect("/dashboard");

  const canCreate = member.role === "admin" || member.role === "pm";

  return (
    <GoalsList workspaceId={id} goals={goals} canCreate={canCreate} />
  );
}
