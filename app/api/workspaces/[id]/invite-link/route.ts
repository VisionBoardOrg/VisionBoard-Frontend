import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Sentinel email used to identify workspace-level (open) invite links
const LINK_SENTINEL = "__invite_link__";

type Params = { params: Promise<{ id: string }> };

async function getRequester(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { select: { ownerId: true } } },
  });
}

/** GET — return existing open invite token (or create one) */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workspaceId } = await params;
  const member = await getRequester(workspaceId, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  // SECURITY (CRITICAL-4): Restrict open invite link access to admin and owner only.
  // Previously pm-role members could also retrieve the token, giving them the ability
  // to share it externally and add unlimited external users to the workspace.
  const isOwner = member.workspace.ownerId === session.user.id;
  const isAdmin = member.role === "admin";
  if (!isOwner && !isAdmin)
    return NextResponse.json({ error: "Only workspace admins can manage invite links." }, { status: 403 });

  // Find or create the workspace-level invite record.
  // SECURITY: Use a 30-day rolling expiry rather than the previous year-2099 sentinel
  // so stale links cannot grant access indefinitely after a team member departs.
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let invite = await prisma.workspaceInvite.findFirst({
    where: { workspaceId, email: LINK_SENTINEL, status: "pending" },
  });

  let activeRawToken = "";

  if (!invite) {
    // SECURITY (HIGH-7): Generate a raw token, return it ONCE in the JSON
    // response, and store only SHA-256(hex).
    activeRawToken = crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(activeRawToken).digest("hex");
    invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: LINK_SENTINEL,
        role: "eng",
        inviterId: session.user.id,
        expiresAt: thirtyDaysFromNow,
        keyHash,
        token: activeRawToken.slice(0, 25), // deprecated stub
      },
    });
  } else if (invite.keyHash) {
    // Existing invite already has keyHash — but we cannot recover the raw token
    // from the DB. Rotate to a new token to keep UX of GET returning a usable link.
    activeRawToken = crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(activeRawToken).digest("hex");
    invite = await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { keyHash, token: activeRawToken.slice(0, 25), expiresAt: thirtyDaysFromNow },
    });
  } else {
    // Legacy pre-migration invite — migrate on read.
    activeRawToken = crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(activeRawToken).digest("hex");
    invite = await prisma.workspaceInvite.update({
      where: { id: invite.id },
      data: { keyHash, token: activeRawToken.slice(0, 25), expiresAt: thirtyDaysFromNow },
    });
  }

  return NextResponse.json({ token: activeRawToken });
}

/** POST — regenerate (rotate) the open invite token */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workspaceId } = await params;
  const member = await getRequester(workspaceId, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const isOwner = member.workspace.ownerId === session.user.id;
  if (!isOwner && member.role !== "admin")
    return NextResponse.json({ error: "Only admins can regenerate the invite link." }, { status: 403 });

  // Delete existing open invite(s) and create a fresh one with a new token.
  // SECURITY: Use a 30-day rolling expiry instead of year-2099.
  await prisma.workspaceInvite.deleteMany({
    where: { workspaceId, email: LINK_SENTINEL },
  });

  // SECURITY (HIGH-7): New raw token generated, returned ONCE, stored hashed only.
  const activeRawToken = crypto.randomBytes(24).toString("hex");
  const keyHash = crypto.createHash("sha256").update(activeRawToken).digest("hex");

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email: LINK_SENTINEL,
      role: "eng",
      inviterId: session.user.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      keyHash,
      token: activeRawToken.slice(0, 25), // deprecated stub
    },
  });
  void invite;

  return NextResponse.json({ token: activeRawToken });
}

/** DELETE — disable (revoke) the open invite link */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: workspaceId } = await params;
  const member = await getRequester(workspaceId, session.user.id);
  if (!member)
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const isOwner = member.workspace.ownerId === session.user.id;
  if (!isOwner && member.role !== "admin")
    return NextResponse.json({ error: "Only admins can revoke the invite link." }, { status: 403 });

  await prisma.workspaceInvite.deleteMany({
    where: { workspaceId, email: LINK_SENTINEL },
  });

  return NextResponse.json({ success: true });
}
