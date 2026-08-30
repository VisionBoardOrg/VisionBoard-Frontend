import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";

const ALLOWED_COMMENT_TAGS = ["b", "i", "em", "strong", "u", "s", "code", "a", "br"];

function sanitizeCommentBody(raw: string): string {
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_COMMENT_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["https", "http", "mailto"],
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}

const patchSchema = z.object({
  body: z.string().min(1).max(2000),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (comment.authorId !== session.user.id) {
    return NextResponse.json({ error: "You can only edit your own comments." }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const updated = await prisma.comment.update({
    where: { id },
    data: { body: sanitizeCommentBody(parsed.data.body) },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ comment: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: {
      linkedGoal: { select: { workspaceId: true } },
      linkedMilestone: { select: { goal: { select: { workspaceId: true } } } },
      linkedTask: { select: { milestone: { select: { goal: { select: { workspaceId: true } } } } } },
      linkedDocument: { select: { workspaceId: true } },
    },
  });
  if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve workspaceId for permission check
  const workspaceId =
    comment.linkedGoal?.workspaceId ??
    comment.linkedMilestone?.goal?.workspaceId ??
    comment.linkedTask?.milestone?.goal?.workspaceId ??
    comment.linkedDocument?.workspaceId;

  const isAuthor = comment.authorId === session.user.id;
  let isAdmin = false;

  if (workspaceId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    });
    isAdmin = member?.role === "admin";
  }

  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "Only the comment author or an admin can delete comments." }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
