import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  objective: z.string().min(1).optional(),
  keyResults: z.array(z.unknown()).optional(),
  targetDate: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "completed", "cancelled"]).optional(),
  healthScore: z.number().int().min(0).max(100).optional(),
});

async function getGoalAndVerifyMember(id: string, userId: string) {
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) return { goal: null, member: null };

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: goal.workspaceId, userId } },
  });
  return { goal, member };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { goal, member } = await getGoalAndVerifyMember(id, session.user.id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const full = await prisma.goal.findUnique({
    where: { id },
    include: {
      milestones: {
        include: { tasks: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
      documents: { include: { author: { select: { id: true, name: true } } } },
      comments: {
        include: { author: { select: { id: true, name: true, image: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ goal: full });
}

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

  const { goal, member } = await getGoalAndVerifyMember(id, session.user.id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { targetDate, keyResults, ...rest } = parsed.data;
  const updated = await prisma.goal.update({
    where: { id },
    data: {
      ...rest,
      ...(keyResults !== undefined ? { keyResults: keyResults as never } : {}),
      ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: goal.workspaceId,
      userId: session.user.id,
      entityType: "goal",
      entityId: id,
      action: "updated",
    },
  });

  return NextResponse.json({ goal: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { goal, member } = await getGoalAndVerifyMember(id, session.user.id);
  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (member.role !== "admin" && member.role !== "pm") {
    return NextResponse.json({ error: "Only admins and PMs can delete goals" }, { status: 403 });
  }

  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
