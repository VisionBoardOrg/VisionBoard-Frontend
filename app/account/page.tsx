import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { DataPrivacySection } from "@/components/settings/DataPrivacySection";

export const metadata = {
  title: "Account Settings — VisionBoard",
  description: "Manage your personal profile, data, and account.",
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const [user, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    }),
    // Grab the first workspace membership so AppShell has a workspaceId to work with.
    // Account settings are workspace-agnostic but the shell needs this context.
    prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: { id: true, plan: true, aiCreditsUsed: true, ownerId: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  if (!user) redirect("/auth/login");

  // If the user has no workspace yet, send them to onboarding
  if (!membership) redirect("/onboarding");

  const workspace = membership.workspace;
  const isOwner   = workspace.ownerId === session.user.id;
  const plan      = workspace.plan;

  return (
    <AppShell
      workspaceId={workspace.id}
      role={session.user.role}
      plan={plan}
      aiCreditsUsed={workspace.aiCreditsUsed}
      aiCreditsMax={plan === "free" ? 10 : plan === "startup" ? 100 : -1}
      userId={session.user.id}
      isOwner={isOwner}
    >
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-ink">Account Settings</h1>
          <p className="text-slate text-sm mt-1">
            Manage your personal profile and data.
          </p>
        </div>

        {/* ── Profile ── */}
        <ProfileSection
          initialName={user.name}
          initialEmail={user.email}
          initialImage={user.image}
        />

        {/* ── Data & Privacy ── */}
        <DataPrivacySection
          workspaceId={workspace.id}
          userEmail={user.email}
        />

      </div>
    </AppShell>
  );
}
