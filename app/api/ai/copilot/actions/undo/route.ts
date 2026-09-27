import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { undoBoardAction, type ExecutedBoardAction } from "@/lib/ai/board-action-executor";
import { z } from "zod";

const undoSchema = z.object({
  workspaceId: z.string(),
  action: z.object({
    id: z.string(),
    action: z.any(),
    entityType: z.enum(["milestone", "task", "goal"]),
    entityId: z.string(),
    entityTitle: z.string(),
    success: z.boolean(),
    message: z.string(),
    undoData: z.record(z.unknown()).optional(),
    canUndo: z.boolean(),
    appliedAt: z.string(),
  }),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = undoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parsed.error.format() }, { status: 400 });
  }

  const { workspaceId, action } = parsed.data;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await undoBoardAction(workspaceId, session.user.id, action as ExecutedBoardAction);

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: result.message });
}
