import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { tiptapDocSchema } from "@/lib/validations/tiptap-schema";
import { indexSingleEntity } from "@/lib/ai/indexer";

const patchSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.unknown().optional(),
  linkedGoalId: z.string().nullable().optional(),
  linkedMilestoneId: z.string().nullable().optional(),
  linkedTaskId: z.string().nullable().optional(),
});

/**
 * Fetch document + membership in a single parallel round trip.
 * Returns null for member if the user doesn't belong to the workspace.
 */
async function getDocWithMember(docId: string, userId: string) {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      authorId: true,
      linkedGoalId: true,
      linkedMilestoneId: true,
      linkedTaskId: true,
    },
  });
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

  // Single consolidated query — fetches document, relations, and verifies caller workspace membership
  const full = await prisma.document.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      comments: {
        include: { author: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
      workspace: {
        select: {
          members: {
            where: { userId: session.user.id },
            select: { role: true },
          },
        },
      },
    },
  });

  if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!full.workspace?.members?.length) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ document: full });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { doc, member } = await getDocWithMember(id, session.user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Validate Tiptap content structure against the node-type allowlist
  if (parsed.data.content !== undefined && parsed.data.content !== null) {
    const contentCheck = tiptapDocSchema.safeParse(parsed.data.content);
    if (!contentCheck.success) {
      return NextResponse.json(
        { error: "Document content contains disallowed node types or unsafe values." },
        { status: 400 }
      );
    }
  }

  // Calculate storage delta if content is changing
  let contentDeltaBytes = 0;
  if (parsed.data.content !== undefined) {
    const existingDoc = await prisma.document.findUnique({
      where: { id },
      select: { content: true },
    });
    const oldBytes = Buffer.byteLength(JSON.stringify(existingDoc?.content ?? {}), "utf8");
    const newBytes = Buffer.byteLength(JSON.stringify(parsed.data.content ?? {}), "utf8");
    contentDeltaBytes = newBytes - oldBytes;
  }

  const [updated] = await prisma.$transaction([
    prisma.document.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.content !== undefined ? { content: parsed.data.content as never } : {}),
        ...(parsed.data.linkedGoalId !== undefined ? { linkedGoalId: parsed.data.linkedGoalId } : {}),
        ...(parsed.data.linkedMilestoneId !== undefined ? { linkedMilestoneId: parsed.data.linkedMilestoneId } : {}),
        ...(parsed.data.linkedTaskId !== undefined ? { linkedTaskId: parsed.data.linkedTaskId } : {}),
      },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: doc.workspaceId,
        userId: session.user.id,
        entityType: "document",
        entityId: id,
        action: "updated",
        diff: { before: { title: doc.title }, after: { title: parsed.data.title ?? doc.title } } as never,
      },
    }),
  ]);

  // Adjust workspace storage counter with the size delta
  if (contentDeltaBytes > 0) {
    await prisma.$executeRaw`
      UPDATE "Workspace"
      SET "storageUsedBytes" = "storageUsedBytes" + ${contentDeltaBytes}
      WHERE id = ${doc.workspaceId}
    `;
  } else if (contentDeltaBytes < 0) {
    const decrement = Math.abs(contentDeltaBytes);
    await prisma.$executeRaw`
      UPDATE "Workspace"
      SET "storageUsedBytes" = GREATEST(0, "storageUsedBytes" - ${decrement})
      WHERE id = ${doc.workspaceId}
    `;
  }

  // Background incremental knowledge indexing for AI Copilot
  indexSingleEntity(doc.workspaceId, "document", id).catch((err) =>
    console.error("[documents/patch] Incremental index error:", err)
  );

  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { doc, member } = await getDocWithMember(id, session.user.id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const isAuthor = doc.authorId === session.user.id;
  const isAdmin = member.role === "admin";
  if (!isAuthor && !isAdmin) {
    return NextResponse.json({ error: "Only the document author or an admin can delete documents." }, { status: 403 });
  }

  // Fetch content size before delete so we can decrement the workspace counter
  const docFull = await prisma.document.findUnique({
    where: { id },
    select: { content: true },
  });
  const contentBytes = docFull
    ? Buffer.byteLength(JSON.stringify(docFull.content ?? {}), "utf8")
    : 0;

  await prisma.$transaction([
    prisma.document.delete({ where: { id } }),
    prisma.workspaceEmbedding.deleteMany({ where: { workspaceId: doc.workspaceId, entityId: id } }),
  ]);

  // Decrement storage counter via raw SQL to avoid Prisma client type mismatch
  await prisma.$executeRaw`
    UPDATE "Workspace"
    SET "storageUsedBytes" = GREATEST(0, "storageUsedBytes" - ${contentBytes})
    WHERE id = ${doc.workspaceId}
  `;

  return NextResponse.json({ success: true });
}
