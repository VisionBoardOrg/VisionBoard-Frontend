import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Logo from "@/components/reusables/Logo";
import { CheckCircle2, AlertTriangle, ArrowRight, Building2, UserCheck } from "lucide-react";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    include: {
      workspace: true,
      inviter: { select: { name: true, email: true } },
    },
  });

  if (!invite || invite.status !== "pending") {
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

  const session = await auth();

  // If user is not logged in, redirect them to register/login with callback back to this invite page
  if (!session?.user?.id) {
    const callbackUrl = encodeURIComponent(`/invite/${token}`);
    redirect(`/auth/register?callbackUrl=${callbackUrl}&email=${encodeURIComponent(invite.email)}`);
  }

  // User is logged in: Check if they are already a member
  const existingMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: invite.workspaceId,
        userId: session.user.id,
      },
    },
  });

  if (!existingMembership) {
    // Add user as workspace member
    await prisma.workspaceMember.create({
      data: {
        workspaceId: invite.workspaceId,
        userId: session.user.id,
        role: invite.role as any,
      },
    });

    // Mark invite as accepted
    await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
  }

  // Redirect user straight to workspace board
  redirect(`/workspace/${invite.workspaceId}/board`);
}
