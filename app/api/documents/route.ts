import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { checkPlanLimit, PLAN_LIMITS } from "@/lib/plan-limits";
import { tiptapDocSchema } from "@/lib/validations/tiptap-schema";

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

  // Validate Tiptap content structure against the node-type allowlist
  if (content !== undefined && content !== null) {
    const contentCheck = tiptapDocSchema.safeParse(content);
    if (!contentCheck.success) {
      return NextResponse.json(
        { error: "Document content contains disallowed node types or unsafe values." },
        { status: 400 }
      );
    }
  }

  // Run membership + workspace fetch in parallel
  const [member, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, owner: { select: { plan: true } } },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const plan = workspace.owner.plan ?? "free";

  // ── Plan limit checks (no full content scan) ───────────────────────────────
  // 1. Document count limit — use a COUNT, not a full SELECT
  const docCount = await prisma.document.count({ where: { workspaceId } });
  const countCheck = checkPlanLimit(
    { plan, aiCreditsUsed: docCount },
    "create_document"
  );
  if (!countCheck.allowed) {
    return NextResponse.json(
      { error: countCheck.reason, upgradePrompt: countCheck.upgradePrompt },
      { status: 403 }
    );
  }

  // 2. Storage limit — read storageUsedBytes via raw query so this works before
  //    and after `prisma generate` picks up the new schema field.
  const storageLimitMb = PLAN_LIMITS[plan].storageMb;
  if (storageLimitMb !== -1) {
    const incomingBytes = Buffer.byteLength(JSON.stringify(content ?? {}), "utf8");
    const incomingMb = incomingBytes / (1024 * 1024);
    const [{ storageUsedBytes }] = await prisma.$queryRaw<[{ storageUsedBytes: bigint }]>`
      SELECT "storageUsedBytes" FROM "Workspace" WHERE id = ${workspaceId}
    `;
    const currentMb = Number(storageUsedBytes ?? 0) / (1024 * 1024);

    if (currentMb + incomingMb > storageLimitMb) {
      return NextResponse.json(
        {
          error: `This would exceed your ${storageLimitMb} MB document storage limit on the ${plan} plan.`,
          upgradePrompt: "Upgrade for more storage.",
        },
        { status: 403 }
      );
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const incomingBytes = Buffer.byteLength(JSON.stringify(content ?? {}), "utf8");

  // Create the document and atomically update the storage counter
  const [document] = await prisma.$transaction([
    prisma.document.create({
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
    }),
    prisma.activityLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        entityType: "document",
        entityId: "pending",
        action: "created",
        diff: { title } as never,
      },
    }),
  ]);

  // Increment storage counter via raw SQL — avoids Prisma client type mismatch
  // before `prisma generate` has been re-run after adding storageUsedBytes.
  await prisma.$executeRaw`
    UPDATE "Workspace"
    SET "storageUsedBytes" = "storageUsedBytes" + ${incomingBytes}
    WHERE id = ${workspaceId}
  `;

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

  // Pagination — defaults: page 1, 50 items, max 100
  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const skip  = (page - 1) * limit;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: { workspaceId },
      // Exclude `content` (the heavy JSONB blob) from list views — only metadata needed
      select: {
        id: true,
        title: true,
        authorId: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
        linkedGoalId: true,
        linkedMilestoneId: true,
        linkedTaskId: true,
        author: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.document.count({ where: { workspaceId } }),
  ]);

  return NextResponse.json({ documents, total, page, limit });
}
