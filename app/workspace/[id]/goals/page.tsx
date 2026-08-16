import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { GoalsList } from "@/components/goals/GoalsList";

interface GoalsPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: GoalsPageProps) {
  // Intentionally lightweight — only needs the name for the title tag.
  // The page component runs its own parallel queries; Next.js calls
  // generateMetadata concurrently with the page component so there is
  // no double-wait here.
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: `Goals — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function GoalsPage({ params }: GoalsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const goals = await prisma.goal.findMany({
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
  });

  const canCreate = member.role === "admin" || member.role === "pm";

  return (
    <GoalsList workspaceId={id} goals={goals} canCreate={canCreate} />
  );
}
