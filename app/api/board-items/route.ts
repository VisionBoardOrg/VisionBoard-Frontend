import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  workspaceId: z.string(),
  entityType: z.enum(["goal", "milestone", "task", "note"]),
  x: z.number().default(100),
  y: z.number().default(100),
  width: z.number().default(200),
  height: z.number().default(120),
  label: z.string().optional(),
  linkedGoalId: z.string().optional(),
  linkedMilestoneId: z.string().optional(),
  linkedTaskId: z.string().optional(),
  color: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Verify membership
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const boardItem = await prisma.boardItem.create({ data: parsed.data });
  return NextResponse.json({ boardItem }, { status: 201 });
}
