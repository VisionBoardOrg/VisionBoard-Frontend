import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { checkPlanLimit } from "@/lib/plan-limits";

// Sentinel used to identify open / workspace-level invite links
const LINK_SENTINEL = "__invite_link__";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: {
      workspace: { select: { id: true, name: true, ownerId: true, owner: { select: { plan: true } } } },
      inviter: { select: { name: true, email: true } },
    },
  });

  if (!invite || invite.status !== "pending") {
    return <InvalidInvite />;
  }

  // Enforce expiry for open links too (even though they're set far future,
  // the check catches any manually-shortened expiries)
  if (invite.expiresAt < new Date()) {
    return <InvalidInvite />;
  }

  const session = await auth();

  // ── Open / workspace-level invite link ──────────────────────────────────
  if (invite.email === LINK_SENTINEL) {
    if (!session?.user?.id) {
      const callbackUrl = encodeURIComponent(`/invite/${token}`);
      redirect(`/auth/register?callbackUrl=${callbackUrl}`);
    }

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: session.user.id } },
    });

    if (!existing) {
      // Check workspace owner plan member limit before adding
      const memberCount = await prisma.workspaceMember.count({
        where: { workspaceId: invite.workspaceId },
      });
      const limitCheck = checkPlanLimit(
        {
          plan: invite.workspace.owner.plan ?? "free",
          currentAiCredits: 0,
          currentMemberCount: memberCount,
          currentDocumentCount: 0,
          currentWorkspaceCount: 0,
        },
        "invite_member"
      );
      if (!limitCheck.allowed) {
        return <MemberLimitReached />;
      }

      await prisma.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: session.user.id, role: invite.role as never },
      });

      await prisma.activityLog.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: session.user.id,
          entityType: "workspace",
          entityId: invite.workspaceId,
          action: "member_joined_via_link",
          diff: { role: invite.role } as never,
        },
      });
      // Don't mark as accepted — open link stays reusable for others
    }

    redirect(`/workspace/${invite.workspaceId}/board`);
  }

  // ── Per-email invite ─────────────────────────────────────────────────────
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/invite/${token}`);
    redirect(`/auth/register?callbackUrl=${callbackUrl}&email=${encodeURIComponent(invite.email)}`);
  }

  // Enforce that the logged-in user's email matches the invite recipient
  if (session.user.email !== invite.email) {
    return <WrongAccountInvite inviteEmail={invite.email} />;
  }

  const existingMembership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: session.user.id } },
  });

  if (!existingMembership) {
    // Check workspace plan member limit
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId: invite.workspaceId },
    });
    const limitCheck = checkPlanLimit(
      {
        plan: invite.workspace.owner.plan ?? "free",
        currentAiCredits: 0,
        currentMemberCount: memberCount,
        currentDocumentCount: 0,
        currentWorkspaceCount: 0,
      },
      "invite_member"
    );
    if (!limitCheck.allowed) {
      return <MemberLimitReached />;
    }

    await prisma.workspaceMember.create({
      data: { workspaceId: invite.workspaceId, userId: session.user.id, role: invite.role as never },
    });
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });

    await prisma.activityLog.create({
      data: {
        workspaceId: invite.workspaceId,
        userId: session.user.id,
        entityType: "workspace",
        entityId: invite.workspaceId,
        action: "member_joined_via_invite",
        diff: { role: invite.role, inviteId: invite.id } as never,
      },
    });
  }

  redirect(`/workspace/${invite.workspaceId}/board`);
}

function InvalidInvite() {
  return (
    <div className="min-h-screen bg-offwhite flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-xl font-bold text-ink">Invitation Invalid or Expired</h1>
        <p className="text-sm text-slate">
          This invitation link is either invalid, already accepted, or has expired.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors w-full"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

function MemberLimitReached() {
  return (
    <div className="min-h-screen bg-offwhite flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-xl font-bold text-ink">Workspace Member Limit Reached</h1>
        <p className="text-sm text-slate">
          This workspace has reached its member limit on the current plan. Ask the workspace owner to upgrade.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors w-full"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

function WrongAccountInvite({ inviteEmail }: { inviteEmail: string }) {
  return (
    <div className="min-h-screen bg-offwhite flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} />
        </div>
        <h1 className="text-xl font-bold text-ink">Wrong Account</h1>
        <p className="text-sm text-slate">
          This invitation was sent to <strong>{inviteEmail}</strong>. Please sign in with that email address to accept it.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors w-full"
        >
          Sign in with correct account
        </Link>
      </div>
    </div>
  );
}
