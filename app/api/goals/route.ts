import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  workspaceId: z.string(),
  title: z.string().min(1).max(200),
  objective: z.string().min(1),
  keyResults: z.array(z.object({
    id: z.string(),
    title: z.string(),
    target: z.number(),
    current: z.number(),
    unit: z.string(),
  })).optional().default([]),
  targetDate: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "completed", "cancelled"]).optional().default("draft"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const goal = await prisma.goal.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      title: parsed.data.title,
      objective: parsed.data.objective,
      keyResults: parsed.data.keyResults,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
      status: parsed.data.status,
      ownerId: session.user.id,
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      userId: session.user.id,
      entityType: "goal",
      entityId: goal.id,
      action: "created",
    },
  });

  return NextResponse.json({ goal }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const goals = await prisma.goal.findMany({
    where: { workspaceId },
    include: {
      milestones: {
        include: { tasks: true },
        orderBy: { order: "asc" },
      },
      _count: { select: { documents: true, comments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ goals });
}
