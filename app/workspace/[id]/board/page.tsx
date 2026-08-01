import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { BoardCanvas } from "@/components/board/BoardCanvas";

interface BoardPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: BoardPageProps) {
  const { id } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { id }, select: { name: true } });
  return { title: `Board — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // Verify the user is a member of this workspace
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const [boardItems, goals, milestones, members] = await Promise.all([
    prisma.boardItem.findMany({
      where: { workspaceId: id },
      include: {
        linkedGoal: true,
        linkedMilestone: { include: { tasks: true } },
      },
    }),
    prisma.goal.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "asc" } }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId: id } },
      include: { tasks: true },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, image: true } } },
    }),
  ]);

  return (
    <AppShell workspaceId={id} role={session.user.role}>
      <BoardCanvas
        workspaceId={id}
        initialItems={boardItems as never}
        goals={goals as never}
        milestones={milestones as never}
        members={members.map((m) => m.user)}
      />
    </AppShell>
  );
}
