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

  // Fetch membership + goals in parallel. The workspace name for the metadata
  // title is sourced from the same membership include — no extra query needed.
  const [member, goals] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
      include: { workspace: { select: { plan: true, name: true, ownerId: true } } },
    }),
    prisma.goal.findMany({
      where: { workspaceId: id },
      include: { milestones: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!member) redirect("/dashboard");

  // Check plan gate for timeline/Gantt — workspace is already loaded via member
  const limit = checkPlanLimit({ plan: member.workspace.plan, aiCreditsUsed: 0 }, "timeline_gantt");
  const isGated = !limit.allowed;

  return (
    <AppShell workspaceId={id} role={session.user.role} plan={member.workspace.plan}
      userId={session.user.id}
      isOwner={member.workspace.ownerId === session.user.id}
    >
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
