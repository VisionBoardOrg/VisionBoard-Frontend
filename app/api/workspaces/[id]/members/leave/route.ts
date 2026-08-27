import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workspaceId } = await params;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true, name: true },
  });

  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  if (workspace.ownerId === session.user.id) {
    return NextResponse.json(
      { error: "The workspace owner cannot leave. Transfer ownership or delete the workspace instead." },
      { status: 403 }
    );
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "You are not a member of this workspace." }, { status: 404 });

  await prisma.workspaceMember.delete({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });

  return NextResponse.json({ success: true });
}
