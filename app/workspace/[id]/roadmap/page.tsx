import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RoadmapView } from "@/components/roadmap/RoadmapView";
import { checkPlanLimit } from "@/lib/plan-limits";
import {
  getSlimWorkspaceMembership,
  getUserPlanAndCredits,
  getWorkspaceName,
} from "@/lib/workspace-data";

interface RoadmapPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: RoadmapPageProps) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Roadmap — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function RoadmapPage({ params }: RoadmapPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // getSlimWorkspaceMembership and getUserPlanAndCredits are shared with
  // WorkspaceLayout via React.cache() — zero duplicate DB round-trips.
  const [member, currentUser, goals] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    getUserPlanAndCredits(session.user.id),
    prisma.goal.findMany({
      where: { workspaceId: id },
      include: {
        milestones: {
          include: {
            tasks: {
              select: {
                id: true,
                title: true,
                status: true,
                dueDate: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!member || !currentUser) redirect("/dashboard");

  const plan = currentUser.plan;
  // Check plan gate for timeline/Gantt based on user plan
  const limit = checkPlanLimit(
    { plan, currentAiCredits: 0, currentMemberCount: 0, currentDocumentCount: 0, currentWorkspaceCount: 0 },
    "timeline_gantt"
  );
  const isGated = !limit.allowed;

  return (
    <RoadmapView
      workspaceId={id}
      goals={goals as never}
      isGated={isGated}
      upgradePrompt={limit.reason}
      userRole={session.user.role}
    />
  );
}
