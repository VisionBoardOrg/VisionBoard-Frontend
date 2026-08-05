import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  /** The member who will become the new owner. */
  newOwnerId: z.string(),
  /** Optional role to assign to the current owner after the transfer. Defaults to "admin". */
  previousOwnerRole: z.enum(["pm", "exec", "eng", "marketing", "admin"]).default("admin"),
});

/**
 * POST /api/workspaces/[id]/transfer-ownership
 *
 * Only the current workspace owner may call this.
 * Atomically:
 *   1. Updates Workspace.ownerId to newOwnerId.
 *   2. Sets the new owner's WorkspaceMember.role to "admin".
 *   3. Sets the previous owner's WorkspaceMember.role to previousOwnerRole (default "admin").
 */
export async function POST(
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

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { newOwnerId, previousOwnerRole } = parsed.data;

    if (newOwnerId === session.user.id) {
      return NextResponse.json(
        { error: "You are already the owner." },
        { status: 400 }
      );
    }

    // Verify requester is the current owner
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (workspace.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: "Only the workspace owner can transfer ownership." },
        { status: 403 }
      );
    }

    // Verify the new owner is a member of this workspace
    const newOwnerMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
    });

    if (!newOwnerMember) {
      return NextResponse.json(
        { error: "The selected user is not a member of this workspace." },
        { status: 404 }
      );
    }

    // Execute atomically
    await prisma.$transaction([
      // Update workspace owner
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { ownerId: newOwnerId },
      }),
      // New owner gets admin role
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: newOwnerId } },
        data: { role: "admin" },
      }),
      // Previous owner gets the specified role (defaults to admin)
      prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
        data: { role: previousOwnerRole },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[POST /api/workspaces/[id]/transfer-ownership]", err);
    return NextResponse.json(
      { error: "Failed to transfer ownership." },
      { status: 500 }
    );
  }
}
