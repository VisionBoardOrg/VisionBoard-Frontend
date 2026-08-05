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
  // Reuse the same select shape fetched in the page to avoid an extra connection.
  // Next.js deduplicates fetch/cache calls but not Prisma — keep it minimal.
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: { name: true },
  });
  return { title: `Board — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function BoardPage({ params }: BoardPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");

  const { id } = await params;

  // Fold the membership check into the workspace query so we use one fewer
  // connection, then run the remaining data queries in parallel.
  const [memberCheck, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    }),
    prisma.workspace.findUnique({
      where: { id },
      select: { plan: true, aiCreditsUsed: true, ownerId: true },
    }),
  ]);

  if (!memberCheck) redirect("/dashboard");
  if (!workspace) redirect("/dashboard");

  const [boardItems, goals, milestones, members] = await Promise.all([
    prisma.boardItem.findMany({
      where: { workspaceId: id },
      // Hard cap: a board with >500 items becomes unusable in a canvas UI.
      // Fetching thousands of items + their full relations on every load kills
      // performance. This cap prevents runaway queries at scale.
      take: 500,
      include: {
        linkedGoal: {
          select: { id: true, title: true, status: true, healthScore: true },
        },
        linkedMilestone: {
          select: {
            id: true, title: true, status: true, goalId: true,
            tasks: { select: { id: true, title: true, status: true, priority: true, assigneeId: true } },
          },
        },
      },
    }),
    prisma.goal.findMany({
      where: { workspaceId: id },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId: id } },
      select: {
        id: true, title: true, status: true, goalId: true,
        tasks: { select: { id: true, title: true, status: true, priority: true, assigneeId: true } },
      },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, image: true } } },
    }),
  ]);

  return (
    <AppShell workspaceId={id} role={session.user.role}
      plan={workspace?.plan}
      aiCreditsUsed={workspace?.aiCreditsUsed}
      aiCreditsMax={workspace?.plan === "free" ? 10 : workspace?.plan === "startup" ? 100 : -1}
      userId={session.user.id}
      isOwner={workspace?.ownerId === session.user.id}
    >
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
