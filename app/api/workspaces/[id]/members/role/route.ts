import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const roleSchema = z.object({
  role: z.enum(["pm", "exec", "eng", "marketing", "admin"] as const),
});

// PATCH /api/workspaces/[id]/members/role
// Allows the current user to update their own role in this workspace.
// Admins can also update others' roles by passing targetUserId in the body.
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

    const { role } = parsed.data;
    const targetUserId: string = body.targetUserId ?? session.user.id;
    const isSelf = targetUserId === session.user.id;

    // Verify requester is a member of this workspace
    const requester = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });

    if (!requester) {
      return NextResponse.json({ error: "Workspace not found or access denied." }, { status: 404 });
    }

    // Only admins can change other people's roles
    if (!isSelf && requester.role !== "admin") {
      return NextResponse.json(
        { error: "Only workspace admins can change other members' roles." },
        { status: 403 }
      );
    }

    const updated = await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      data: { role },
    });

    return NextResponse.json({ success: true, role: updated.role });
  } catch (err: any) {
    console.error("[PATCH /api/workspaces/[id]/members/role]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update role." },
      { status: 500 }
    );
  }
}
