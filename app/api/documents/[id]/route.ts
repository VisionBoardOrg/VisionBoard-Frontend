import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.unknown().optional(),
  linkedGoalId: z.string().nullable().optional(),
  linkedMilestoneId: z.string().nullable().optional(),
  linkedTaskId: z.string().nullable().optional(),
});

async function getMemberForDoc(docId: string, userId: string) {
  const doc = await prisma.document.findUnique({ where: { id: docId } });
  if (!doc) return { doc: null, member: null };
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: doc.workspaceId, userId } },
  });
  return { doc, member };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { doc, member } = await getMemberForDoc(id, session.user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const full = await prisma.document.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      comments: {
        include: { author: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ document: full });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { doc, member } = await getMemberForDoc(id, session.user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const updated = await prisma.document.update({
    where: { id },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.content !== undefined ? { content: parsed.data.content as never } : {}),
      ...(parsed.data.linkedGoalId !== undefined ? { linkedGoalId: parsed.data.linkedGoalId } : {}),
      ...(parsed.data.linkedMilestoneId !== undefined ? { linkedMilestoneId: parsed.data.linkedMilestoneId } : {}),
      ...(parsed.data.linkedTaskId !== undefined ? { linkedTaskId: parsed.data.linkedTaskId } : {}),
    },
    include: { author: { select: { id: true, name: true } } },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: doc.workspaceId,
      userId: session.user.id,
      entityType: "document",
      entityId: id,
      action: "updated",
      diff: { before: { title: doc.title }, after: { title: updated.title } } as never,
    },
  });

  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { doc, member } = await getMemberForDoc(id, session.user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only author or admin can delete
  const isAuthor = doc.authorId === session.user.id;
  const isAdmin = member.role === "admin";
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "Only the document author or an admin can delete documents." }, { status: 403 });
  }

  await prisma.document.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
