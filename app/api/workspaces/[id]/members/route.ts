import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPlanLimit } from "@/lib/plan-limits";
import { sendWorkspaceInviteEmail } from "@/lib/workspace-invite-email";
import { createNotification } from "@/lib/notifications";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["pm", "exec", "eng", "marketing", "admin"] as const),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const { id: workspaceId } = await params;
    const body = await request.json();

    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { email, role } = parsed.data;

    // Check requester membership and permission
    const requesterMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: session.user.id,
        },
      },
      include: {
        workspace: {
          include: {
            owner: {
              select: { plan: true },
            },
            members: true,
            invites: {
              where: { status: "pending" },
            },
          },
        },
      },
    });

    if (!requesterMember) {
      return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
    }

    const isOwner = requesterMember.workspace.ownerId === session.user.id;
    const canInvite = isOwner || requesterMember.role === "admin" || requesterMember.role === "pm";

    if (!canInvite) {
      return NextResponse.json(
        { error: "Only the workspace owner, admins, and product managers can invite team members." },
        { status: 403 }
      );
    }

    const workspace = requesterMember.workspace;
    const totalCurrentAndPending = workspace.members.length + workspace.invites.length;

    // Check plan member limit (counting current members + pending invites)
    const limitCheck = checkPlanLimit(
      {
        plan: workspace.owner.plan ?? "free",
        currentAiCredits: 0,
        currentMemberCount: totalCurrentAndPending,
        currentDocumentCount: 0,
        currentWorkspaceCount: 0,
      },
      "invite_member"
    );

    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: limitCheck.reason, upgradePrompt: limitCheck.upgradePrompt },
        { status: 403 }
      );
    }

    // Check if user is already an active member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const activeMember = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: existingUser.id,
          },
        },
      });
      if (activeMember) {
        return NextResponse.json(
          { error: `${email} is already an active member of this workspace.` },
          { status: 400 }
        );
      }
    }

    // Create or refresh invitation
    let invite = await prisma.workspaceInvite.findFirst({
      where: {
        workspaceId,
        email,
        status: "pending",
      },
    });

    if (invite) {
      // Refresh role & expiration
      invite = await prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          role,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    } else {
      invite = await prisma.workspaceInvite.create({
        data: {
          workspaceId,
          email,
          role,
          inviterId: session.user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Build invite URL from server-side env — never trust the client-supplied Origin header
    const appOrigin = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
    const inviteUrl = `${appOrigin}/invite/${invite.token}`;

    // Send workspace invitation email via SMTP (if configured) or log to dev console
    const dispatchResult = await sendWorkspaceInviteEmail({
      email,
      workspaceName: workspace.name,
      inviterName: session.user.name || "A workspace admin",
      role,
      inviteUrl,
    });

    if (!dispatchResult.sent) {
      return NextResponse.json(
        { error: dispatchResult.message },
        { status: 400 }
      );
    }

    // If the invitee already has a user account, dispatch an in-app notification as well
    if (existingUser) {
      createNotification({
        userId: existingUser.id,
        workspaceId: workspace.id,
        actorId: session.user.id,
        type: "workspace_invite",
        title: `Invited to ${workspace.name}`,
        message: `${session.user.name || "A team member"} invited you to join "${workspace.name}" as ${role}.`,
        entityType: "workspace",
        entityId: workspace.id,
        link: inviteUrl,
        // SECURITY (MEDIUM-5): Never store the raw invite token in notification
        // metadata. It would be returned to any client that fetches notifications,
        // creating an unnecessary additional exfiltration surface for the token.
        metadata: { role },
      }).catch((err) => console.error("[members POST] In-app invite notification failed:", err));
    }

    return NextResponse.json(
      {
        success: true,
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          token: invite.token,
          expiresAt: invite.expiresAt,
        },
        inviteUrl: appOrigin ? `${appOrigin}/invite/${invite.token}` : undefined,
        emailDispatch: dispatchResult,
        message: dispatchResult.message,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/workspaces/[id]/members]", err);
    return NextResponse.json(
      { error: "Failed to send invitation email. Please try again." },
      { status: 500 }
    );
  }
}

// Cancel or delete pending invite
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;
    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get("inviteId");

    if (!inviteId) {
      return NextResponse.json({ error: "inviteId is required" }, { status: 400 });
    }

    // Only admins and PMs may cancel invitations
    const requesterMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
      include: { workspace: { select: { ownerId: true } } },
    });

    if (!requesterMember) {
      return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
    }

    const isOwner = requesterMember.workspace.ownerId === session.user.id;
    const canManage = isOwner || requesterMember.role === "admin" || requesterMember.role === "pm";

    if (!canManage) {
      return NextResponse.json(
        { error: "Only admins and PMs can cancel invitations." },
        { status: 403 }
      );
    }

    await prisma.workspaceInvite.delete({
      where: { id: inviteId, workspaceId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/workspaces/[id]/members]", err);
    return NextResponse.json({ error: "Failed to cancel invitation." }, { status: 500 });
  }
}

// List all workspace members with mention handles
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;

    // Verify requester is a member of the workspace
    const requesterMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });

    if (!requesterMember) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const formattedMembers = members.map((m) => {
      const emailPrefix = m.user.email ? m.user.email.split("@")[0].toLowerCase() : "";
      const nameHandle = m.user.name
        ? m.user.name.toLowerCase().replace(/[^a-z0-9]/g, "")
        : emailPrefix;

      return {
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        handle: nameHandle || emailPrefix,
      };
    });

    return NextResponse.json({ members: formattedMembers });
  } catch (err) {
    console.error("[GET /api/workspaces/[id]/members]", err);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}
