import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPlanLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId, command } = await request.json() as { workspaceId: string; command: string };
  if (!workspaceId || !command) return NextResponse.json({ error: "workspaceId and command required" }, { status: 400 });

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const limitCheck = checkPlanLimit({ plan: workspace.plan, aiCreditsUsed: workspace.aiCreditsUsed }, "ai_credit");
  if (!limitCheck.allowed) return NextResponse.json({ error: limitCheck.reason, upgradePrompt: limitCheck.upgradePrompt }, { status: 403 });

  const [milestones, sprints, members] = await Promise.all([
    prisma.milestone.findMany({ where: { goal: { workspaceId } }, include: { goal: { select: { title: true } } }, take: 20 }),
    prisma.sprint.findMany({ where: { workspaceId }, take: 10 }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: { select: { id: true, name: true } } } }),
  ]);

  const ctx = JSON.stringify({
    milestones: milestones.map((m) => ({ id: m.id, title: m.title, status: m.status })),
    sprints: sprints.map((s) => ({ id: s.id, name: s.name })),
    members: members.map((m) => ({ id: m.userId, name: m.user.name })),
  });

  const systemPrompt = `Parse user command into a board action. Context: ${ctx}
Return ONLY JSON: {"action":"update|move|assign|create","entity":"milestone|task|goal","id":"string|null","changes":{},"description":"plain english summary"}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: command }],
    });

    const raw = response.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("");
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const action = JSON.parse(cleaned);

    await prisma.aIGenerationLog.create({
      data: { workspaceId, userId: session.user.id, feature: "nl_board_edit", promptInput: command, modelOutput: JSON.stringify(action), accepted: null },
    });
    await prisma.workspace.update({ where: { id: workspaceId }, data: { aiCreditsUsed: { increment: 1 } } });

    return NextResponse.json({ action });
  } catch (err) {
    console.error("[api/ai/nl-board-edit]", err);
    return NextResponse.json({ error: "AI parsing failed." }, { status: 500 });
  }
}
