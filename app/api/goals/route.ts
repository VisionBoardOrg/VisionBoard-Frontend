import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nullableIsoDateString } from "@/lib/validations/date-schema";

const createSchema = z.object({
  workspaceId: z.string(),
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(2000),
  keyResults: z.array(z.object({
    id: z.string(),
    title: z.string().max(300),
    target: z.number(),
    current: z.number(),
    unit: z.string().max(50),
  })).max(20).optional().default([]),
  targetDate: nullableIsoDateString,
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

  // Fire-and-forget audit log — non-blocking, now has the real entityId
  prisma.activityLog.create({
    data: {
      workspaceId: parsed.data.workspaceId,
      userId: session.user.id,
      entityType: "goal",
      entityId: goal.id,
      action: "created",
    },
  }).catch((err: unknown) => console.error("[goals POST] Activity log failed:", err));

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

  const page  = Math.max(1, parseInt(searchParams.get("page")  ?? "1",  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const skip  = (page - 1) * limit;

  const [goals, total] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId },
      include: {
        milestones: {
          // Only fetch task summaries for progress calculation — not full task objects
          include: { tasks: { select: { id: true, status: true, storyPoints: true }, orderBy: { order: "asc" } } },
          orderBy: { order: "asc" },
        },
        _count: { select: { documents: true, comments: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.goal.count({ where: { workspaceId } }),
  ]);

  return NextResponse.json(
    { goals, total, page, limit },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } }
  );
}
