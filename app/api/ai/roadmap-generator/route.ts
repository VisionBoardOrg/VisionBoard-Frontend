import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createHash } from "crypto";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const schema = z.object({
  workspaceId: z.string(),
  // Cap length to limit prompt injection surface area
  text: z.string().min(20).max(2000),
});

/**
 * Hash a prompt string before logging it so raw business-sensitive content
 * is not stored verbatim in the database.
 */
function hashPrompt(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { workspaceId, text } = parsed.data;

  // Verify membership BEFORE workspace fetch or credit consumption
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // ── Atomic credit debit (TOCTOU-safe) ──────────────────────────────────────
  const creditLimit = PLAN_LIMITS[workspace.plan].aiCreditsPerMonth;
  const isUnlimited = creditLimit === -1 || creditLimit === "unlimited";

  if (!isUnlimited) {
    const debited = await prisma.workspace.updateMany({
      where: { id: workspaceId, aiCreditsUsed: { lt: creditLimit as number } },
      data: { aiCreditsUsed: { increment: 1 } },
    });
    if (debited.count === 0) {
      return NextResponse.json(
        {
          error: `You've used all ${creditLimit} AI credits this month on the ${workspace.plan} plan.`,
          upgradePrompt: "Upgrade to unlock more AI credits.",
        },
        { status: 403 }
      );
    }
  } else {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiCreditsUsed: { increment: 1 } },
    });
  }
  // ───────────────────────────────────────────────────────────────────────────

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
        promptInput: hashPrompt(text),
        modelOutput: JSON.stringify(result),
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        accepted: null,
      },
    });

    return NextResponse.json({ milestones: result.milestones, generationId: log.id });
  } catch (err) {
    console.error("[api/ai/roadmap-generator]", err);

    // Refund the credit — the AI call failed so no value was delivered
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiCreditsUsed: { decrement: 1 } },
    }).catch(() => { /* best-effort refund */ });

    return NextResponse.json({ error: "AI generation failed." }, { status: 500 });
  }
}
