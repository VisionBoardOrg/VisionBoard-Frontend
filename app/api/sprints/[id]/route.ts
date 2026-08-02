import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  goal: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["planned", "active", "completed"]).optional(),
  velocity: z.number().int().positive().nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: sprint.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { startDate, endDate, ...rest } = parsed.data;
  const updated = await prisma.sprint.update({
    where: { id },
    data: {
      ...rest,
      ...(startDate ? { startDate: new Date(startDate) } : {}),
      ...(endDate ? { endDate: new Date(endDate) } : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      workspaceId: sprint.workspaceId,
      userId: session.user.id,
      entityType: "sprint",
      entityId: id,
      action: "updated",
      diff: parsed.data as never,
    },
  });

  return NextResponse.json({ sprint: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sprint = await prisma.sprint.findUnique({ where: { id } });
  if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: sprint.workspaceId, userId: session.user.id } },
  });
  if (!member || (member.role !== "admin" && member.role !== "pm")) {
    return NextResponse.json({ error: "Only admins and PMs can delete sprints." }, { status: 403 });
  }

  // Unlink tasks before deleting
  await prisma.task.updateMany({ where: { sprintId: id }, data: { sprintId: null } });
  await prisma.sprint.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
