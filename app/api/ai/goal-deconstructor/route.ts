import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
/** Hard timeout for the AI call — prevents blocking a Node.js worker indefinitely */
const AI_TIMEOUT_MS = 45_000;

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
  // Rate limit: AI generation route (LLM call per request)
  const rateLimit = checkRateLimit(request, "ai-goal-deconstructor", {
    windowMs: 15 * 60 * 1000,
    max: 10,
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

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

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // ── Atomic credit debit (TOCTOU-safe) ──────────────────────────────────────
  // We increment BEFORE the AI call. If the AI call fails we decrement
  // in the catch block. This prevents concurrent requests from bypassing the
  // limit by racing past the read-before-write check.
  const creditLimit = PLAN_LIMITS[user.plan].aiCreditsPerMonth;
  const isUnlimited = creditLimit === -1 || creditLimit === "unlimited";

  if (!isUnlimited) {
    // updateMany with a WHERE condition is the atomic compare-and-swap:
    // only increments if aiCreditsUsed is still under the limit.
    const debited = await prisma.user.updateMany({
      where: { id: session.user.id, aiCreditsUsed: { lt: creditLimit as number } },
      data: { aiCreditsUsed: { increment: 1 } },
    });
    if (debited.count === 0) {
      return NextResponse.json(
        {
          error: `You've used all ${creditLimit} AI credits this month on your ${user.plan} plan across your account.`,
          upgradePrompt: "Upgrade your account to unlock more AI credits.",
        },
        { status: 403 }
      );
    }
  } else {
    // Unlimited plan — just increment the counter for audit purposes
    await prisma.user.update({
      where: { id: session.user.id },
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

  // ── AbortSignal timeout & client disconnect chaining ──
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const handleClientAbort = () => controller.abort();
  request.signal.addEventListener("abort", handleClientAbort, { once: true });

  try {
    const response = await openrouter.chat.completions.create(
      {
        model: OPENROUTER_MODEL,
        max_tokens: 2500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      },
      { signal: controller.signal }
    );

    const raw = response.choices[0]?.message?.content ?? "";

    // Guard: model returned nothing
    if (!raw.trim()) {
      console.warn("[api/ai/goal-deconstructor] Model returned empty response. finish_reason:",
        response.choices[0]?.finish_reason);
      await prisma.user.update({
        where: { id: session.user.id },
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
      await prisma.user.update({
        where: { id: session.user.id },
        data: { aiCreditsUsed: { decrement: 1 } },
      }).catch(() => {});
      return NextResponse.json(
        { error: "The AI model returned an unreadable response. Please try again." },
        { status: 422 }
      );
    }

    // Fire-and-forget audit log — failure here should not affect the user response
    // or roll back the successfully consumed credit.
    prisma.aIGenerationLog.create({
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
    }).catch((err: unknown) => console.error("[api/ai/goal-deconstructor] Log write failed:", err));

    return NextResponse.json(result);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[api/ai/goal-deconstructor]", isTimeout ? "Request timed out" : err);

    // Refund the credit — the AI call failed so no value was delivered
    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiCreditsUsed: { decrement: 1 } },
    }).catch(() => { /* best-effort refund */ });

    return NextResponse.json(
      { error: isTimeout ? "AI request timed out. Please try again." : "AI generation failed." },
      { status: isTimeout ? 504 : 500 }
    );
  } finally {
    clearTimeout(timeoutId);
    request.signal.removeEventListener("abort", handleClientAbort);
  }
}
