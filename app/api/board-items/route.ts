import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Validate color as a CSS hex value only — prevents CSS injection via style attributes
const hexColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional();

const createSchema = z.object({
  workspaceId: z.string(),
  entityType: z.enum(["goal", "milestone", "task", "note"]),
  x: z.number().default(100),
  y: z.number().default(100),
  width: z.number().default(200),
  height: z.number().default(120),
  label: z.string().max(200).optional(),
  linkedGoalId: z.string().optional(),
  linkedMilestoneId: z.string().optional(),
  linkedTaskId: z.string().optional(),
  color: hexColor,
});

// Minimal task shape returned inside board item responses — only what the
// canvas needs to render card summaries and connector lines.
const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  priority: true,
  assigneeId: true,
  dueDate: true,
} as const;

const BOARD_ITEM_INCLUDE = {
  linkedGoal: {
    select: { id: true, title: true, status: true, healthScore: true },
  },
  linkedMilestone: {
    select: {
      id: true, title: true, status: true, goalId: true,
      tasks: { select: TASK_SELECT },
    },
  },
} as const;

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

  // SECURITY (HIGH-3): Validate that any linked entity belongs to the same workspace
  // before creating the board item. Without this check an attacker who is a member
  // of Workspace A can supply a linkedGoalId from Workspace B and receive that goal's
  // data in the response via the BOARD_ITEM_INCLUDE eager-load.
  const { workspaceId, linkedGoalId, linkedMilestoneId, linkedTaskId } = parsed.data;

  if (linkedGoalId) {
    const goal = await prisma.goal.findFirst({ where: { id: linkedGoalId, workspaceId } });
    if (!goal) return NextResponse.json({ error: "Linked goal not found in this workspace." }, { status: 403 });
  }

  if (linkedMilestoneId) {
    const milestone = await prisma.milestone.findFirst({
      where: { id: linkedMilestoneId, goal: { workspaceId } },
    });
    if (!milestone) return NextResponse.json({ error: "Linked milestone not found in this workspace." }, { status: 403 });
  }

  if (linkedTaskId) {
    const task = await prisma.task.findFirst({ where: { id: linkedTaskId, workspaceId } });
    if (!task) return NextResponse.json({ error: "Linked task not found in this workspace." }, { status: 403 });
  }

  const boardItem = await prisma.boardItem.create({
    data: parsed.data,
    include: BOARD_ITEM_INCLUDE,
  });
  return NextResponse.json({ boardItem }, { status: 201 });
}
