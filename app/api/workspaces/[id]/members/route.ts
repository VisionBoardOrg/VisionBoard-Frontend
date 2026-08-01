import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkPlanLimit } from "@/lib/plan-limits";
import { sendWorkspaceInviteEmail } from "@/lib/workspace-invite-email";
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

    if (requesterMember.role !== "admin" && requesterMember.role !== "pm") {
      return NextResponse.json(
        { error: "Only admins and product managers can invite team members." },
        { status: 403 }
      );
    }

    const workspace = requesterMember.workspace;
    const totalCurrentAndPending = workspace.members.length + workspace.invites.length;

    // Check plan member limit (counting current members + pending invites)
    const limitCheck = checkPlanLimit(
      { plan: workspace.plan, aiCreditsUsed: totalCurrentAndPending },
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

    const origin = request.headers.get("origin") || request.nextUrl.origin || "http://localhost:3000";
    const inviteUrl = `${origin}/invite/${invite.token}`;

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
        inviteUrl,
        emailDispatch: dispatchResult,
        message: dispatchResult.message,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[POST /api/workspaces/[id]/members]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to send invitation email. Please try again." },
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

    await prisma.workspaceInvite.delete({
      where: { id: inviteId, workspaceId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to cancel invitation" }, { status: 500 });
  }
}
