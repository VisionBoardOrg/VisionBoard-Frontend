import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const roleSchema = z.object({
  role: z.enum(["pm", "exec", "eng", "marketing", "admin"] as const),
  /** The member whose role is being changed. Required — callers pass their own
   *  id when switching their own dashboard role, or another member's id when
   *  an owner/admin manages the team. */
  targetUserId: z.string(),
});

/**
 * PATCH /api/workspaces/[id]/members/role
 *
 * Rules:
 * - Any member may change their OWN role (dashboard view switch), EXCEPT:
 *     • they may not self-assign "admin" unless they are already admin or owner.
 * - Workspace owners and admins may change OTHER members' roles.
 * - Only the workspace owner may grant "admin" to another member.
 * - Nobody (including the owner) may use this endpoint to change the workspace
 *   owner's role — use /transfer-ownership for that.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: workspaceId } = await params;
    const body = await request.json();

    const parsed = roleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { role, targetUserId } = parsed.data;
    const isSelf = targetUserId === session.user.id;

    // Verify requester is a member of this workspace
    const requester = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
      include: { workspace: { select: { ownerId: true } } },
    });

    if (!requester) {
      return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
    }

    const isOwner = requester.workspace.ownerId === session.user.id;
    const isAdmin = requester.role === "admin";

    if (isSelf) {
      // Self role switch — allowed for everyone, but non-admin/non-owner cannot
      // self-escalate to admin.
      if (role === "admin" && !isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "You do not have permission to assign yourself the admin role." },
          { status: 403 }
        );
      }
    } else {
      // Changing another member's role — requires owner or admin
      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "Only workspace admins can change other members' roles." },
          { status: 403 }
        );
      }

      // Only the workspace owner may grant admin to others
      if (role === "admin" && !isOwner) {
        return NextResponse.json(
          { error: "Only the workspace owner can grant the admin role." },
          { status: 403 }
        );
      }

      // The workspace owner's role is managed via /transfer-ownership, not here
      if (targetUserId === requester.workspace.ownerId) {
        return NextResponse.json(
          { error: "Use the transfer ownership flow to change the owner's role." },
          { status: 403 }
        );
      }
    }

    // Verify the target is actually a member of this workspace
    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
    });
    if (!target) {
      return NextResponse.json({ error: "Target user is not a member of this workspace." }, { status: 404 });
    }

    const updated = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role },
    });

    return NextResponse.json({ success: true, role: updated.role });
  } catch (err) {
    console.error("[PATCH /api/workspaces/[id]/members/role]", err);
    return NextResponse.json(
      { error: "Failed to update role." },
      { status: 500 }
    );
  }
}
