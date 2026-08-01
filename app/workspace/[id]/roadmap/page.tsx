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
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    include: { workspace: true },
  });
  if (!member) redirect("/dashboard");

  // Check plan gate for timeline/Gantt
  const limit = checkPlanLimit({ plan: member.workspace.plan, aiCreditsUsed: 0 }, "timeline_gantt");
  const isGated = !limit.allowed;

  const goals = await prisma.goal.findMany({
    where: { workspaceId: id },
    include: { milestones: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <AppShell workspaceId={id} role={session.user.role} plan={member.workspace.plan}>
      <RoadmapView
        workspaceId={id}
        goals={goals as never}
        isGated={isGated}
        upgradePrompt={limit.reason}
        userRole={session.user.role}
      />
    </AppShell>
  );
}
