import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  assigneeId: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  title: z.string().min(1).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Verify the task belongs to a workspace the user is a member of
  const task = await prisma.task.findUnique({
    where: { id },
    include: { milestone: { select: { goal: { select: { workspaceId: true } } } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = task.milestone.goal.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.task.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ task: updated });
}
