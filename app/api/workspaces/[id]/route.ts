import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(80).trim(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workspaceId } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Only admin or owner can rename
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    include: { workspace: { select: { ownerId: true, name: true } } },
  });

  if (!member) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  const isOwner = member.workspace.ownerId === session.user.id;
  const isAdmin = member.role === "admin";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Only the workspace owner or an admin can rename it." }, { status: 403 });
  }

  const newSlug = parsed.data.name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 60);

  // Ensure slug uniqueness — append a short suffix if needed
  let slug = newSlug;
  const existing = await prisma.workspace.findFirst({
    where: { slug, NOT: { id: workspaceId } },
  });
  if (existing) {
    slug = `${newSlug}-${Date.now().toString(36)}`;
  }

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: parsed.data.name, slug },
    select: { id: true, name: true, slug: true },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "workspace",
      entityId: workspaceId,
      action: "renamed",
      diff: { before: member.workspace.name, after: parsed.data.name } as never,
    },
  });

  return NextResponse.json({ workspace: updated });
}

export async function DELETE(
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
    select: { ownerId: true },
  });

  if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (workspace.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Only the workspace owner can delete it." }, { status: 403 });
  }

  await prisma.workspace.delete({ where: { id: workspaceId } });

  return NextResponse.json({ success: true });
}
