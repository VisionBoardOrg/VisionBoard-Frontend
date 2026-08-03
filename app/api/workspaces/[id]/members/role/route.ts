import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const roleSchema = z.object({
  role: z.enum(["pm", "exec", "eng", "marketing", "admin"] as const),
  targetUserId: z.string().optional(),
});

/**
 * PATCH /api/workspaces/[id]/members/role
 *
 * Only workspace owners and existing admins can change roles.
 * No member may change their own role (prevents self-escalation to admin).
 * Only the workspace owner may grant the "admin" role.
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

    // targetUserId must be explicitly provided — self-role-change is disallowed
    if (!targetUserId) {
      return NextResponse.json(
        { error: "targetUserId is required." },
        { status: 400 }
      );
    }

    if (targetUserId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot change your own role." },
        { status: 403 }
      );
    }

    // Verify requester is a member of this workspace (re-query DB for current role)
    const requester = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
      include: { workspace: { select: { ownerId: true } } },
    });

    if (!requester) {
      return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
    }

    const isOwner = requester.workspace.ownerId === session.user.id;
    const isAdmin = requester.role === "admin";

    // Only owners and admins may change roles
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Only workspace admins can change member roles." },
        { status: 403 }
      );
    }

    // Only the workspace owner may grant admin role
    if (role === "admin" && !isOwner) {
      return NextResponse.json(
        { error: "Only the workspace owner can grant admin role." },
        { status: 403 }
      );
    }

    // Prevent changing the owner's own role via this endpoint
    if (targetUserId === requester.workspace.ownerId && !isOwner) {
      return NextResponse.json(
        { error: "Cannot change the workspace owner's role." },
        { status: 403 }
      );
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
