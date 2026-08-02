import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(120),
  goal: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  velocity: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, name, goal, startDate, endDate, velocity } = parsed.data;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sprint = await prisma.sprint.create({
    data: {
      workspaceId,
      name,
      goal: goal ?? null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      velocity: velocity ?? null,
      status: "planned",
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "sprint",
      entityId: sprint.id,
      action: "created",
      diff: { name } as never,
    },
  });

  return NextResponse.json({ sprint }, { status: 201 });
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

  const sprints = await prisma.sprint.findMany({
    where: { workspaceId },
    include: {
      tasks: {
        select: { id: true, title: true, status: true, priority: true, storyPoints: true, assigneeId: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ sprints });
}
