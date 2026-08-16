import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { RoadmapView } from "@/components/roadmap/RoadmapView";
import { checkPlanLimit } from "@/lib/plan-limits";

interface RoadmapPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: RoadmapPageProps) {
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: `Roadmap — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function RoadmapPage({ params }: RoadmapPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // Fetch membership, user plan, and goals in parallel.
  const [member, currentUser, goals] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
      include: { workspace: { select: { name: true, ownerId: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, aiCreditsUsed: true },
    }),
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
  const limit = checkPlanLimit({ plan, aiCreditsUsed: 0 }, "timeline_gantt");
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
