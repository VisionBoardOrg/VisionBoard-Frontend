import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWorkspaceIndexStats, indexWorkspace, indexSingleEntity } from "@/lib/ai/indexer";
import { z } from "zod";

const postSchema = z.object({
  workspaceId: z.string(),
  entityType: z.enum(["document", "goal", "milestone", "task"]).optional(),
  entityId: z.string().optional(),
});

export async function GET(request: NextRequest) {
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

  const summary = await indexWorkspace(workspaceId);
  const updatedStats = await getWorkspaceIndexStats(workspaceId);

  return NextResponse.json({
    success: true,
    summary,
    stats: updatedStats,
  });
}
