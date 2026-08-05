import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "crypto";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const OPENROUTER_MODEL = "inclusionai/ling-3.0-flash:free";

/** Hash a prompt string before logging — avoids storing raw business content verbatim. */
function hashPrompt(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

const schema = z.object({
  workspaceId: z.string(),
  // Cap length to limit prompt injection surface area
  objective: z.string().min(3).max(2000),
  targetDate: z.string().optional(),
  keyResults: z
    .array(
      z.object({
        title: z.string().max(300),
        target: z.number(),
        unit: z.string().max(50),
      })
    )
    .max(20)
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

  // Verify membership first — cheapest check, avoids unnecessary workspace fetch
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // ── Atomic credit debit (TOCTOU-safe) ──────────────────────────────────────
  // We increment BEFORE the Anthropic call. If the AI call fails we decrement
  // in the catch block. This prevents concurrent requests from bypassing the
  // limit by racing past the read-before-write check.
  const creditLimit = PLAN_LIMITS[workspace.plan].aiCreditsPerMonth;
  const isUnlimited = creditLimit === -1 || creditLimit === "unlimited";

  if (!isUnlimited) {
    // updateMany with a WHERE condition is the atomic compare-and-swap:
    // only increments if aiCreditsUsed is still under the limit.
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
    // Unlimited plan — just increment the counter for audit purposes
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiCreditsUsed: { increment: 1 } },
    });
  }
  // ───────────────────────────────────────────────────────────────────────────

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
    const response = await openrouter.chat.completions.create({
      model: OPENROUTER_MODEL,
      max_tokens: 2500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";

    // Guard: model returned nothing
    if (!raw.trim()) {
      console.warn("[api/ai/goal-deconstructor] Model returned empty response. finish_reason:",
        response.choices[0]?.finish_reason);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { aiCreditsUsed: { decrement: 1 } },
      }).catch(() => {});
      return NextResponse.json(
        { error: "The AI model returned an empty response. Please try again." },
        { status: 503 }
      );
    }

    // Strip <think>…</think> reasoning blocks
    const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    const cleaned = withoutThink
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(cleaned);
    } catch {
      console.warn("[api/ai/goal-deconstructor] JSON parse failed. Raw response:", raw);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { aiCreditsUsed: { decrement: 1 } },
      }).catch(() => {});
      return NextResponse.json(
        { error: "The AI model returned an unreadable response. Please try again." },
        { status: 422 }
      );
    }

    await prisma.aIGenerationLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        feature: "goal_deconstructor",
        promptInput: hashPrompt(userContent),
        modelOutput: JSON.stringify(result),
        tokensUsed:
          (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
        accepted: null,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/goal-deconstructor]", err);

    // Refund the credit — the AI call failed so no value was delivered
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiCreditsUsed: { decrement: 1 } },
    }).catch(() => { /* best-effort refund */ });

    return NextResponse.json({ error: "AI generation failed." }, { status: 500 });
  }
}
