import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceIndexStats, indexWorkspace, indexSingleEntity } from "@/lib/ai/indexer";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const postSchema = z.object({
  workspaceId: z.string(),
  entityType: z.enum(["document", "goal", "milestone", "task"]).optional(),
  entityId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  // Rate limit: lightweight stats read (used when the Copilot drawer opens) —
  // more generous than the reindex POST, but still guarded against polling abuse.
  const rateLimit = checkRateLimit(request, "ai-copilot-index-stats", {
    windowMs: 15 * 60 * 1000,
    max: 30,
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const stats = await getWorkspaceIndexStats(workspaceId);
  return NextResponse.json({ stats });
}

export async function POST(request: NextRequest) {
  // Rate limit: reindexing embeds an entire workspace (expensive) — strict cap.
  const rateLimit = checkRateLimit(request, "ai-copilot-index", {
    windowMs: 15 * 60 * 1000,
    max: 5,
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, entityType, entityId } = parsed.data;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (entityType && entityId) {
    await indexSingleEntity(workspaceId, entityType, entityId);
    return NextResponse.json({ success: true, updated: { entityType, entityId } });
  }

  // Full-workspace reindex is expensive (re-embeds every entity) — restrict it
  // to the workspace owner or an admin-role member. Incremental single-entity
  // indexing above stays available to all members.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerId: true },
  });
  const isOwner = workspace?.ownerId === session.user.id;
  const isAdmin = member.role === "admin";

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: "Only the workspace owner or an admin can trigger a full workspace reindex." },
      { status: 403 }
    );
  }

  const summary = await indexWorkspace(workspaceId);
  const updatedStats = await getWorkspaceIndexStats(workspaceId);

  return NextResponse.json({
    success: true,
    summary,
    stats: updatedStats,
  });
}
