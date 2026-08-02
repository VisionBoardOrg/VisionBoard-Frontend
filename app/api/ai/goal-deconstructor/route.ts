import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPlanLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const schema = z.object({
  workspaceId: z.string(),
  objective: z.string().min(10),
  targetDate: z.string().optional(),
  keyResults: z
    .array(z.object({ title: z.string(), target: z.number(), unit: z.string() }))
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, objective, targetDate, keyResults } = parsed.data;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limitCheck = checkPlanLimit(
    { plan: workspace.plan, aiCreditsUsed: workspace.aiCreditsUsed },
    "ai_credit"
  );
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: limitCheck.reason, upgradePrompt: limitCheck.upgradePrompt },
      { status: 403 }
    );
  }

  const systemPrompt = `You are an OKR and sprint planning expert. Given a high-level objective, break it down into actionable sub-tasks, sprint milestones, and owner recommendations.
Return ONLY valid JSON (no markdown fences):
{
  "sprints": [
    {
      "name": "string",
      "goal": "string",
      "durationWeeks": number,
      "tasks": [
        { "title": "string", "priority": "low|medium|high|urgent", "storyPoints": number, "suggestedOwnerRole": "pm|eng|marketing|exec" }
      ]
    }
  ],
  "suggestedTimeline": "string",
  "risks": ["string"],
  "recommendation": "string"
}
Today is ${new Date().toISOString().split("T")[0]}. Target date: ${targetDate ?? "not specified"}.`;

  const userContent = [
    `Objective: ${objective}`,
    keyResults?.length
      ? `Key Results:\n${keyResults.map((kr) => `- ${kr.title} (target: ${kr.target} ${kr.unit})`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const result = JSON.parse(cleaned);

    await prisma.aIGenerationLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        feature: "goal_deconstructor",
        promptInput: userContent,
        modelOutput: JSON.stringify(result),
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        accepted: null,
      },
    });

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiCreditsUsed: { increment: 1 } },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/goal-deconstructor]", err);
    return NextResponse.json({ error: "AI generation failed." }, { status: 500 });
  }
}
