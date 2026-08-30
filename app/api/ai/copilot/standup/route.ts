import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
});

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";

const schema = z.object({
  workspaceId: z.string(),
});

function hashPrompt(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  // Rate limit: AI generation route (LLM call per request)
  const rateLimit = await checkRateLimit(request, "ai-copilot-standup", {
    windowMs: 15 * 60 * 1000,
    max: 10,
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId } = parsed.data;

  const [member, user] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, plan: true, aiCreditsUsed: true },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // ── Atomic credit debit ────────────────────────────────────────────────────
  const creditLimit = PLAN_LIMITS[user.plan].aiCreditsPerMonth;
  const isUnlimited = creditLimit === null || creditLimit === -1;

  if (!isUnlimited) {
    const debited = await prisma.user.updateMany({
      where: { id: session.user.id, aiCreditsUsed: { lt: creditLimit as number } },
      data: { aiCreditsUsed: { increment: 1 } },
    });
    if (debited.count === 0) {
      return NextResponse.json(
        {
          error: `You've used all ${creditLimit} AI credits this month on your ${user.plan} plan.`,
          upgradePrompt: "Upgrade your account to unlock more AI credits.",
        },
        { status: 403 }
      );
    }
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiCreditsUsed: { increment: 1 } },
    });
  }
  // ───────────────────────────────────────────────────────────────────────────

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const [recentDone, inProgress, blocked] = await Promise.all([
    prisma.task.findMany({
      where: {
        milestone: { goal: { workspaceId } },
        status: "done",
        updatedAt: { gte: twoDaysAgo },
      },
      select: { id: true, title: true, assignee: { select: { name: true } }, milestone: { select: { title: true } } },
    }),
    prisma.task.findMany({
      where: {
        milestone: { goal: { workspaceId } },
        status: { in: ["in_progress", "in_review"] },
      },
      select: { id: true, title: true, status: true, assignee: { select: { name: true } }, milestone: { select: { title: true } } },
    }),
    prisma.task.findMany({
      where: {
        milestone: { goal: { workspaceId } },
        status: "blocked",
      },
      select: { id: true, title: true, blockedReason: true, assignee: { select: { name: true } }, milestone: { select: { title: true } } },
    }),
  ]);

  const promptInput = `
Recently Completed Tasks (Last 48h):
${recentDone.map((t) => `- "${t.title}" (Assignee: ${t.assignee?.name || "Team"}, Milestone: ${t.milestone.title})`).join("\n") || "None"}

Tasks In Progress / In Review:
${inProgress.map((t) => `- "${t.title}" [${t.status}] (Assignee: ${t.assignee?.name || "Unassigned"}, Milestone: ${t.milestone.title})`).join("\n") || "None"}

Blocked Tasks:
${blocked.map((t) => `- "${t.title}" (Assignee: ${t.assignee?.name || "Unassigned"}, Blocker: ${t.blockedReason || "None specified"})`).join("\n") || "None"}
`;

  const systemPrompt = `You are an agile Scrum Master and Engineering Lead.
Generate a concise, crisp Daily Standup Digest from the provided task activity.
Structure with:
### 🟢 Completed (Last 48h)
### 🟡 In Flight (Today's Focus)
### 🔴 Blockers & Escalations (Action Required)

Use bullet points, mention assignees, and format task citations as [[cite:task:id:Title]].`;

  try {
    const response = await openrouter.chat.completions.create({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptInput },
      ],
      max_tokens: 1500,
    });

    const standupText = response.choices[0]?.message?.content || "";

    // Audit log
    prisma.aIGenerationLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        feature: "workspace_copilot",
        promptInput: hashPrompt(promptInput),
        modelOutput: hashPrompt(standupText),
        tokensUsed: (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
        accepted: true,
      },
    }).catch(() => {});

    return NextResponse.json({ standup: standupText, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[standup] Error:", err);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiCreditsUsed: { decrement: 1 } },
    }).catch(() => {});

    return NextResponse.json({ error: "Failed to generate standup digest." }, { status: 500 });
  }
}
