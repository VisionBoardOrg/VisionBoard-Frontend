import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { nullableIsoDateString } from "@/lib/validations/date-schema";

const createSchema = z.object({
  workspaceId: z.string(),
  goalId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional().default(""),
  startDate: nullableIsoDateString,
  targetDate: nullableIsoDateString,
  baselineStartDate: nullableIsoDateString,
  baselineTargetDate: nullableIsoDateString,
  dependsOn: z.array(z.string()).optional().default([]),
  status: z.enum(["planned", "in_progress", "completed", "delayed"]).optional().default("planned"),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  // Run member check + goal verification in parallel
  const [member, goal] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
    }),
    prisma.goal.findUnique({
      where: { id: parsed.data.goalId },
      select: { workspaceId: true },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!goal || goal.workspaceId !== parsed.data.workspaceId) {
    return NextResponse.json({ error: "Goal not found in this workspace" }, { status: 404 });
  }

  // Atomic order: use aggregate max instead of count() to avoid race conditions
  const maxOrderResult = await prisma.milestone.aggregate({
    where: { goalId: parsed.data.goalId },
    _max: { order: true },
  });
  const order = (maxOrderResult._max.order ?? -1) + 1;

  const [milestone] = await prisma.$transaction([
    prisma.milestone.create({
      data: {
        goalId: parsed.data.goalId,
        title: parsed.data.title,
        description: parsed.data.description ?? "",
        status: parsed.data.status,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : null,
        baselineStartDate: parsed.data.baselineStartDate ? new Date(parsed.data.baselineStartDate) : null,
        baselineTargetDate: parsed.data.baselineTargetDate ? new Date(parsed.data.baselineTargetDate) : null,
        dependsOn: parsed.data.dependsOn || [],
        order,
      } as never,
      include: { tasks: true },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        userId: session.user.id,
        entityType: "milestone",
        entityId: "pending",
        action: "created",
      },
    }),
  ]);

  return NextResponse.json({ milestone }, { status: 201 });
}
