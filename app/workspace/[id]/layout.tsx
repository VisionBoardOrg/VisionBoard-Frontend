import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";

interface WorkspaceLayoutProps {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export default async function WorkspaceLayout({
  params,
  children,
}: WorkspaceLayoutProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  // Single parallel fetch for membership and current user details
  const [member, currentUser] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
      include: { workspace: { select: { name: true, ownerId: true } } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, aiCreditsUsed: true },
    }),
  ]);

  if (!member || !currentUser) redirect("/dashboard");

  const plan = currentUser.plan;
  const isOwner = member.workspace.ownerId === session.user.id;

  return (
    <AppShell
      workspaceId={id}
      role={session.user.role}
      plan={plan}
      aiCreditsUsed={currentUser.aiCreditsUsed}
      aiCreditsMax={plan === "free" ? 10 : plan === "startup" ? 100 : -1}
      userId={session.user.id}
      isOwner={isOwner}
    >
      {children}
    </AppShell>
  );
}
