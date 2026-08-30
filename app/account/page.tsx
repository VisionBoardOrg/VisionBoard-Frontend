import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { DataPrivacySection } from "@/components/settings/DataPrivacySection";
import { BillingSection } from "@/components/settings/BillingSection";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { Suspense } from "react";

export const metadata = {
  title: "Account Settings — VisionBoard",
  description: "Manage your personal profile, plan, and data.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const [user, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        plan: true,
        aiCreditsUsed: true,
        stripeCustomerId: true,
        stripeCurrentPeriodEnd: true,
        stripeCancelAtPeriodEnd: true,
      },
    }),
    prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: {
        workspace: {
          select: { id: true, ownerId: true },
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
  const plan      = user.plan;
  const limits    = PLAN_LIMITS[plan];

  return (
    <AppShell
      workspaceId={null}
      role={session.user.role}
      plan={plan}
      aiCreditsUsed={user.aiCreditsUsed}
      aiCreditsMax={PLAN_LIMITS[plan].aiCreditsPerMonth ?? -1}
      userId={session.user.id}
      isOwner={isOwner}
    >
      <div className="max-w-2xl mx-auto space-y-8">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-ink">Account Settings</h1>
          <p className="text-slate text-sm mt-1">
            Manage your personal profile, plan, and data.
          </p>
        </div>

        {/* ── Profile ── */}
        <ProfileSection
          initialName={user.name}
          initialEmail={user.email}
          initialImage={user.image}
        />

        {/* ── Plan & Billing ── */}
        <Suspense fallback={<div className="bg-white rounded-2xl border border-border p-6 h-48 animate-pulse" />}>
          <BillingSection
            plan={plan}
            limits={limits}
            isOwnerOrAdmin={true}
            stripeCustomerId={user.stripeCustomerId ?? null}
            stripeCurrentPeriodEnd={user.stripeCurrentPeriodEnd?.toISOString() ?? null}
            stripeCancelAtPeriodEnd={user.stripeCancelAtPeriodEnd}
            aiCreditsUsed={user.aiCreditsUsed}
          />
        </Suspense>

        {/* ── Data & Privacy ── */}
        <DataPrivacySection
          userEmail={user.email}
        />

      </div>
    </AppShell>
  );
}
