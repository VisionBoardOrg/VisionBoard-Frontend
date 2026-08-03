import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validate color as a CSS hex value only — prevents CSS injection via style attributes
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional();

const patchSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  label: z.string().max(200).optional(),
  color: hexColor,
  // Linking fields — allow null to unlink
  linkedGoalId: z.string().nullable().optional(),
  linkedMilestoneId: z.string().nullable().optional(),
  linkedTaskId: z.string().nullable().optional(),
});

// Minimal task shape returned in board item responses — only what the canvas
// needs for rendering, not full task objects.
const BOARD_ITEM_INCLUDE = {
  linkedGoal: {
    select: { id: true, title: true, status: true, healthScore: true },
  },
  linkedMilestone: {
    select: {
      id: true, title: true, status: true, goalId: true,
      tasks: { select: { id: true, title: true, status: true, priority: true, assigneeId: true } },
    },
  },
} as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Fetch item + verify membership in parallel
  const item = await prisma.boardItem.findUnique({
    where: { id: itemId },
    select: { id: true, workspaceId: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: item.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.boardItem.update({
    where: { id: itemId },
    data: parsed.data,
    include: BOARD_ITEM_INCLUDE,
  });
  return NextResponse.json({ boardItem: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const item = await prisma.boardItem.findUnique({
    where: { id: itemId },
    select: { id: true, workspaceId: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: item.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.boardItem.delete({ where: { id: itemId } });
  return NextResponse.json({ success: true });
}
