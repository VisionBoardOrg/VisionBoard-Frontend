import { auth, signOut, invalidateAuthCache } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { invalidateWorkspaceDataCache } from "@/lib/workspace-data";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { checkPlanLimit } from "@/lib/plan-limits";
import { maskEmail } from "@/lib/email/email-service";
import crypto from "crypto";

// Sentinel used to identify open / workspace-level invite links
const LINK_SENTINEL = "__invite_link__";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const [{ token: rawToken }, session] = await Promise.all([params, auth()]);
  const isAuthenticated = Boolean(session?.user?.id);

  // SECURITY (HIGH-7): Raw tokens never go into the DB where they'd be
  // readable by anyone with SELECT. Hash the incoming URL token and look up
  // by SHA-256 hex digest. A deprecated `token` column is still checked as
  // a migration fallback for pre-migration invites.
  const keyHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  const invite = await prisma.workspaceInvite.findFirst({
    where: {
      OR: [{ keyHash }, { token: rawToken }],
    },
    include: {
      workspace: { select: { id: true, name: true, ownerId: true, owner: { select: { plan: true } } } },
      inviter: { select: { name: true, email: true } },
    },
  });

  if (!invite || invite.status !== "pending") {
    return <InvalidInvite isAuthenticated={isAuthenticated} />;
  }

  // Enforce expiry for open links too
  if (invite.expiresAt < new Date()) {
    return <InvalidInvite isAuthenticated={isAuthenticated} />;
  }

  // ── Open / workspace-level invite link ──────────────────────────────────
  if (invite.email === LINK_SENTINEL) {
    if (!session?.user?.id) {
      const callbackUrl = encodeURIComponent(`/invite/${rawToken}`);
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
        return <MemberLimitReached isAuthenticated={isAuthenticated} />;
      }

      await prisma.workspaceMember.create({
        data: { workspaceId: invite.workspaceId, userId: session.user.id, role: invite.role as never },
      });
      invalidateWorkspaceDataCache({ workspaceId: invite.workspaceId, userId: session.user.id });
      invalidateAuthCache(session.user.id);

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
    const callbackUrl = encodeURIComponent(`/invite/${rawToken}`);
    redirect(`/auth/register?callbackUrl=${callbackUrl}&email=${encodeURIComponent(invite.email.toLowerCase())}`);
  }

  // Enforce that the logged-in user's email matches the invite recipient
  if (session.user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return <WrongAccountInvite inviteEmail={invite.email} rawToken={rawToken} />;
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
      return <MemberLimitReached isAuthenticated={isAuthenticated} />;
    }

    await prisma.workspaceMember.create({
      data: { workspaceId: invite.workspaceId, userId: session.user.id, role: invite.role as never },
    });
    invalidateWorkspaceDataCache({ workspaceId: invite.workspaceId, userId: session.user.id });
    invalidateAuthCache(session.user.id);
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

function InvalidInvite({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="min-h-screen bg-offwhite flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-ink">Invitation Invalid or Expired</h1>
        <p className="text-sm text-slate">
          This invitation link is either invalid, already accepted, or has expired.
        </p>
        <Link
          href={isAuthenticated ? "/dashboard" : "/"}
          className="inline-flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors w-full"
        >
          {isAuthenticated ? "Go to Dashboard" : "Return Home"}
        </Link>
      </div>
    </div>
  );
}

function MemberLimitReached({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="min-h-screen bg-offwhite flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-ink">Workspace Member Limit Reached</h1>
        <p className="text-sm text-slate">
          This workspace has reached its member limit on the current plan. Ask the workspace owner to upgrade.
        </p>
        <Link
          href={isAuthenticated ? "/dashboard" : "/"}
          className="inline-flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors w-full"
        >
          {isAuthenticated ? "Go to Dashboard" : "Return Home"}
        </Link>
      </div>
    </div>
  );
}

function WrongAccountInvite({
  inviteEmail,
  rawToken,
}: {
  inviteEmail: string;
  rawToken: string;
}) {
  async function switchAccountAction() {
    "use server";
    const callbackUrl = `/invite/${rawToken}`;
    await signOut({
      redirectTo: `/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    });
  }

  return (
    <div className="min-h-screen bg-offwhite flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-border p-8 max-w-md w-full text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-ink">Wrong Account</h1>
        <p className="text-sm text-slate">
          This invitation was sent to <strong>{maskEmail(inviteEmail)}</strong>. Sign out of your current account and sign in with that email address to accept it.
        </p>
        <form action={switchAccountAction} className="space-y-2.5">
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 bg-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-mid transition-colors w-full cursor-pointer"
          >
            Sign out &amp; switch account
          </button>
        </form>
        <Link
          href="/dashboard"
          className="inline-block text-xs text-slate hover:text-ink hover:underline"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
