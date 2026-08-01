import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedWorkspace } from "@/lib/seed-workspace";
import { checkPlanLimit } from "@/lib/plan-limits";
import { z } from "zod";
import { MemberRole, PlanTier } from "@prisma/client";
import { TemplateName } from "@/lib/templates";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(["pm", "exec", "eng", "marketing", "admin"] as const),
  template: z.enum(["okr_board", "product_roadmap", "quarterly_plan", "sprint_board"] as const),
});

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized. Please sign in again." }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Check plan limit — count existing owned workspaces
    const existingCount = await prisma.workspace.count({ where: { ownerId: session.user.id } });
    const limitCheck = checkPlanLimit(
      { plan: "free" as PlanTier, aiCreditsUsed: existingCount },
      "invite_member"
    );
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.reason, upgradePrompt: limitCheck.upgradePrompt }, { status: 403 });
    }

    const workspace = await seedWorkspace({
      userId: session.user.id,
      workspaceName: parsed.data.name,
      role: parsed.data.role as MemberRole,
      template: parsed.data.template as TemplateName,
    });

    return NextResponse.json({ workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug } }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/workspaces]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create workspace. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: session.user.id } } },
    include: { _count: { select: { members: true, goals: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ workspaces });
}
