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

    // Check plan limit — count existing owned workspaces against the user's actual plan.
    // We look up the user's plan from their first workspace membership; new users with
    // no workspaces yet default to "free".
    const existingCount = await prisma.workspace.count({ where: { ownerId: session.user.id } });

    // Fetch the user's current plan from any existing workspace they own
    const existingWorkspace = await prisma.workspace.findFirst({
      where: { ownerId: session.user.id },
      select: { plan: true },
    });
    const userPlan = existingWorkspace?.plan ?? ("free" as PlanTier);

    const limitCheck = checkPlanLimit(
      { plan: userPlan, aiCreditsUsed: existingCount },
      "create_workspace"
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
  } catch (err) {
    console.error("[POST /api/workspaces]", err);
    return NextResponse.json(
      { error: "Failed to create workspace. Please try again." },
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
