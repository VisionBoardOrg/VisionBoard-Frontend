import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPlanLimit } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// This is the ONLY place Anthropic is called from the frontend app.
// The API key is server-only (never sent to the browser).
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const schema = z.object({
  workspaceId: z.string(),
  text: z.string().min(20),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { workspaceId, text } = parsed.data;

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const limitCheck = checkPlanLimit({ plan: workspace.plan, aiCreditsUsed: workspace.aiCreditsUsed }, "ai_credit");
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: limitCheck.reason, upgradePrompt: limitCheck.upgradePrompt }, { status: 403 });
  }

  const systemPrompt = `You are a product roadmap expert. Return ONLY valid JSON — no markdown fences, no explanation:
{
  "milestones": [
    {
      "title": "string",
      "description": "string",
      "targetDate": "ISO date string (relative to today: ${new Date().toISOString().split("T")[0]})",
      "dependsOn": [],
      "suggestedTasks": ["string"]
    }
  ]
}
Generate 3-7 milestones. Return ONLY the JSON object.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    });

    const raw = response.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text).join("");
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const result = JSON.parse(cleaned) as { milestones: unknown[] };

    const log = await prisma.aIGenerationLog.create({
      data: {
        workspaceId, userId: session.user.id,
        feature: "roadmap_generator",
        promptInput: text,
        modelOutput: JSON.stringify(result),
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        accepted: null,
      },
    });

    await prisma.workspace.update({ where: { id: workspaceId }, data: { aiCreditsUsed: { increment: 1 } } });

    return NextResponse.json({ milestones: result.milestones, generationId: log.id });
  } catch (err) {
    console.error("[api/ai/roadmap-generator]", err);
    return NextResponse.json({ error: "AI generation failed." }, { status: 500 });
  }
}
