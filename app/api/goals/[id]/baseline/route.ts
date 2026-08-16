import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const baselineActionSchema = z.object({
  action: z.enum(["snapshot", "clear"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: goalId } = await params;
  const body = await request.json();
  const parsed = baselineActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: {
      milestones: true,
      workspace: { select: { id: true } },
    },
  });

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const workspaceId = goal.workspaceId;
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (parsed.data.action === "snapshot") {
    // Snapshot current startDate and targetDate into baseline fields
    const updates = goal.milestones.map((m) =>
      prisma.milestone.update({
        where: { id: m.id },
        data: {
          baselineStartDate: m.startDate,
          baselineTargetDate: m.targetDate,
        },
      })
    );
    await prisma.$transaction(updates);

    return NextResponse.json({ success: true, message: "Baseline snapshot created successfully" });
  } else {
    // Clear baseline dates
    await prisma.milestone.updateMany({
      where: { goalId },
      data: {
        baselineStartDate: null,
        baselineTargetDate: null,
      },
    });

    return NextResponse.json({ success: true, message: "Baseline cleared successfully" });
  }
}
