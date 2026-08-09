import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "crypto";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const OPENROUTER_MODEL = "inclusionai/ling-3.0-flash:free";
/** Hard timeout for the AI call — prevents blocking a Node.js worker indefinitely */
const AI_TIMEOUT_MS = 25_000;

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

  // ── AbortSignal timeout — prevents a hung AI call from blocking the worker ──
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await openrouter.chat.completions.create(
      {
        model: OPENROUTER_MODEL,
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      },
      { signal: controller.signal }
    );

    const raw = response.choices[0]?.message?.content ?? "";

    // Guard: model returned nothing
    if (!raw.trim()) {
      console.warn("[api/ai/roadmap-generator] Model returned empty response. finish_reason:",
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
    const cleaned = withoutThink.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let result: { milestones: unknown[] };
    try {
      result = JSON.parse(cleaned) as { milestones: unknown[] };
    } catch {
      console.warn("[api/ai/roadmap-generator] JSON parse failed. Raw response:", raw);
      await prisma.workspace.update({
        where: { id: workspaceId },
        data: { aiCreditsUsed: { decrement: 1 } },
      }).catch(() => {});
      return NextResponse.json(
        { error: "The AI model returned an unreadable response. Please try again." },
        { status: 422 }
      );
    }

    // Audit log creation with fallback
    let generationId: string | undefined;
    try {
      const log = await prisma.aIGenerationLog.create({
        data: {
          workspaceId, userId: session.user.id,
          feature: "roadmap_generator",
          promptInput: hashPrompt(text),
          modelOutput: JSON.stringify(result),
          tokensUsed:
            (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
          accepted: null,
        },
      });
      generationId = log.id;
    } catch (err) {
      console.error("[api/ai/roadmap-generator] Log write failed:", err);
    }

    return NextResponse.json({ milestones: result.milestones, generationId });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error("[api/ai/roadmap-generator]", isTimeout ? "Request timed out" : err);

    // Refund the credit — the AI call failed so no value was delivered
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { aiCreditsUsed: { decrement: 1 } },
    }).catch(() => { /* best-effort refund */ });

    return NextResponse.json(
      { error: isTimeout ? "AI request timed out. Please try again." : "AI generation failed." },
      { status: isTimeout ? 504 : 500 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
