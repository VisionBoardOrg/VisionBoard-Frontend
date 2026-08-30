import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TEMPLATES, TemplateName } from "@/lib/templates";
import { z } from "zod";

const schema = z.object({
  template: z.enum(["okr_board", "product_roadmap", "quarterly_plan"] as const),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: workspaceId } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    include: { workspace: { select: { ownerId: true } } },
  });

  if (!member) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const isOwner = member.workspace.ownerId === session.user.id;
  if (!isOwner && member.role !== "admin" && member.role !== "pm") {
    return NextResponse.json(
      { error: "Only admins and PMs can apply templates." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const tmplDef = TEMPLATES[parsed.data.template as TemplateName];
  if (!tmplDef) return NextResponse.json({ error: "Unknown template" }, { status: 400 });

  const tmpl = tmplDef.data;

  // Apply template in a transaction
  await prisma.$transaction(async (tx) => {
    // Create goals with milestones and tasks
    for (const goal of tmpl.goals) {
      await tx.goal.create({
        data: {
          workspaceId,
          title: goal.title,
          objective: goal.objective,
          status: goal.status,
          targetDate: goal.targetDate,
          keyResults: goal.keyResults as never,
          healthScore: 0,
          milestones: {
            create: goal.milestones.map((ms) => ({
              title: ms.title,
              description: ms.description,
              status: ms.status,
              targetDate: ms.targetDate,
              order: ms.order,
              tasks: {
                create: ms.tasks.map((t) => ({
                  title: t.title,
                  status: t.status,
                  priority: t.priority,
                  storyPoints: t.storyPoints,
                  order: t.order,
                  dueDate: ms.targetDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                  workspaceId,
                })),
              },
            })),
          },
        },
      });
    }
  });

  await prisma.activityLog.create({
    data: {
      workspaceId,
      userId: session.user.id,
      entityType: "workspace",
      entityId: workspaceId,
      action: "template_applied",
      diff: { template: parsed.data.template } as never,
    },
  });

  return NextResponse.json({ success: true, template: parsed.data.template });
}
