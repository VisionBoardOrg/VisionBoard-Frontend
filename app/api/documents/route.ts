import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPlanLimit, checkStorageLimit, estimateDocStorageMb } from "@/lib/plan-limits";

const createSchema = z.object({
  workspaceId: z.string(),
  title: z.string().min(1).max(255),
  content: z.unknown().optional(),
  linkedGoalId: z.string().nullable().optional(),
  linkedMilestoneId: z.string().nullable().optional(),
  linkedTaskId: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, title, content, linkedGoalId, linkedMilestoneId, linkedTaskId } = parsed.data;

  // Verify membership
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Plan limit checks ──────────────────────────────────────────────────────
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // 1. Document count limit
  const docCount = await prisma.document.count({ where: { workspaceId } });
  const countCheck = checkPlanLimit(
    { plan: workspace.plan, aiCreditsUsed: docCount },
    "create_document"
  );
  if (!countCheck.allowed) {
    return NextResponse.json(
      { error: countCheck.reason, upgradePrompt: countCheck.upgradePrompt },
      { status: 403 }
    );
  }

  // 2. Storage limit — estimate incoming size + current total
  const existingDocs = await prisma.document.findMany({
    where: { workspaceId },
    select: { content: true },
  });
  const currentMb = estimateDocStorageMb(existingDocs.map((d) => d.content));
  const incomingMb = estimateDocStorageMb([content ?? {}]);
  const storageCheck = checkStorageLimit(workspace.plan, currentMb, incomingMb);
  if (!storageCheck.allowed) {
    return NextResponse.json(
      { error: storageCheck.reason, upgradePrompt: storageCheck.upgradePrompt },
      { status: 403 }
    );
  }
  // ──────────────────────────────────────────────────────────────────────────

  const document = await prisma.document.create({
    data: {
      workspaceId,
      title,
      content: (content ?? {}) as never,
      authorId: session.user.id,
      linkedGoalId: linkedGoalId ?? null,
      linkedMilestoneId: linkedMilestoneId ?? null,
      linkedTaskId: linkedTaskId ?? null,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  // Write activity log
  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "document",
      entityId: document.id,
      action: "created",
      diff: { title } as never,
    },
  });

  return NextResponse.json({ document }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const documents = await prisma.document.findMany({
    where: { workspaceId },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ documents });
}
