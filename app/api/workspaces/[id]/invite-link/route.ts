import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

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

  const isOwner = member.workspace.ownerId === session.user.id;
  const canManage = isOwner || member.role === "admin" || member.role === "pm";
  if (!canManage)
    return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });

  // Find or create the workspace-level invite record
  let invite = await prisma.workspaceInvite.findFirst({
    where: { workspaceId, email: LINK_SENTINEL, status: "pending" },
  });

  if (!invite) {
    invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: LINK_SENTINEL,
        role: "pm",
        inviterId: session.user.id,
        // Far-future expiry — open links don't expire on their own
        expiresAt: new Date("2099-01-01"),
      },
    });
  }

  return NextResponse.json({ token: invite.token });
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

  // Delete existing open invite(s) and create a fresh one with a new token
  await prisma.workspaceInvite.deleteMany({
    where: { workspaceId, email: LINK_SENTINEL },
  });

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId,
      email: LINK_SENTINEL,
      role: "pm",
      inviterId: session.user.id,
      expiresAt: new Date("2099-01-01"),
    },
  });

  return NextResponse.json({ token: invite.token });
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
