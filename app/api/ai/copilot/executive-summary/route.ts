import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "crypto";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
});

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";

const schema = z.object({
  workspaceId: z.string(),
  saveAsDoc: z.boolean().optional(),
});

function hashPrompt(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, saveAsDoc } = parsed.data;

  // Run membership and user plan fetch
  const [member, user, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, plan: true, aiCreditsUsed: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    }),
  ]);

  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  // ── Atomic credit debit ────────────────────────────────────────────────────
  const creditLimit = PLAN_LIMITS[user.plan].aiCreditsPerMonth;
  const isUnlimited = creditLimit === -1 || creditLimit === "unlimited";

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

  // Gather workspace data across Goals, Milestones, Tasks, and Docs
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [goals, milestones, completedTasks, blockedTasks, inProgressTasks, recentDocs] = await Promise.all([
    prisma.goal.findMany({
      where: { workspaceId },
      select: { id: true, title: true, status: true, healthScore: true, objective: true, targetDate: true },
    }),
    prisma.milestone.findMany({
      where: { goal: { workspaceId } },
      select: { id: true, title: true, status: true, startDate: true, targetDate: true, goal: { select: { title: true } } },
    }),
    prisma.task.findMany({
      where: {
        milestone: { goal: { workspaceId } },
        status: "done",
        updatedAt: { gte: sevenDaysAgo },
      },
      select: { id: true, title: true, assignee: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: {
        milestone: { goal: { workspaceId } },
        status: "blocked",
      },
      select: { id: true, title: true, blockedReason: true, assignee: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: {
        milestone: { goal: { workspaceId } },
        status: { in: ["in_progress", "in_review"] },
      },
      select: { id: true, title: true, status: true, assignee: { select: { name: true } } },
    }),
    prisma.document.findMany({
      where: { workspaceId },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const rawStateSummary = `
Workspace Name: ${workspace.name}
Today's Date: ${new Date().toISOString().split("T")[0]}

Active & Total Goals:
${goals.map((g) => `- Goal: "${g.title}" (Status: ${g.status}, Health: ${g.healthScore}%, Target: ${g.targetDate?.toISOString().split("T")[0] || "N/A"})\n  Objective: ${g.objective}`).join("\n")}

Milestones:
${milestones.map((m) => `- Milestone: "${m.title}" (Goal: "${m.goal.title}", Status: ${m.status}, Target: ${m.targetDate?.toISOString().split("T")[0] || "N/A"})`).join("\n")}

Tasks Completed This Week (${completedTasks.length} total):
${completedTasks.slice(0, 15).map((t) => `- "${t.title}" (Completed by ${t.assignee?.name || "Team"})`).join("\n")}

Blocked Tasks Requiring Attention (${blockedTasks.length} total):
${blockedTasks.map((t) => `- ⚠️ "${t.title}" (Assignee: ${t.assignee?.name || "Unassigned"}, Reason: ${t.blockedReason || "No reason given"})`).join("\n")}

Tasks Currently In Progress / In Review (${inProgressTasks.length} total):
${inProgressTasks.slice(0, 10).map((t) => `- "${t.title}" [${t.status}] (${t.assignee?.name || "Unassigned"})`).join("\n")}

Recent Documents / PRDs:
${recentDocs.map((d) => `- "${d.title}" (Updated: ${d.updatedAt.toISOString().split("T")[0]})`).join("\n")}
`;

  const systemPrompt = `You are a high-level VP of Product and Chief of Staff.
Generate an inspiring, highly professional Executive Status Briefing for the executive leadership team.

Structure the briefing into these distinct sections using clean Markdown formatting:
# 📊 Executive Strategic Briefing: ${workspace.name}
**Reporting Period**: Week of ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}

## 1. 🎯 Strategic Health & OKR Progress
A concise high-level overview of overall project trajectory, average goal health, and velocity momentum.

## 2. 🚀 Key Accomplishments & Delivery Highlights
Bullet points highlighting completed tasks and major milestones achieved this week.

## 3. ⚠️ Risk Radar & Blockers Requiring Escalation
Identify high-risk items, overdue milestones, and specific blocked tasks with tactical resolution recommendations.

## 4. 🔭 Upcoming Horizon & Next Sprint Focus
Target milestones and priority deliverables scheduled for the next 1-2 weeks.

## 5. 💡 Leadership Recommendations
2-3 actionable, high-impact suggestions for the engineering and product leads.

CITATIONS: When mentioning specific goals, milestones, or tasks, cite them using the notation:
[[cite:entityType:entityId:Title]]
(e.g., [[cite:goal:id:Launch MVP]], [[cite:milestone:id:Alpha Release]], [[cite:task:id:Auth Service]])`;

  try {
    const response = await openrouter.chat.completions.create({
      model: OPENROUTER_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please generate the executive briefing based on this workspace data:\n\n${rawStateSummary}` },
      ],
      max_tokens: 3000,
    });

    const summaryText = response.choices[0]?.message?.content || "";

    if (!summaryText.trim()) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { aiCreditsUsed: { decrement: 1 } },
      }).catch(() => {});
      return NextResponse.json({ error: "AI model returned an empty response." }, { status: 503 });
    }

    const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);

    // Audit Log
    await prisma.aIGenerationLog.create({
      data: {
        workspaceId,
        userId: session.user.id,
        feature: "executive_summary",
        promptInput: hashPrompt(rawStateSummary),
        modelOutput: summaryText.slice(0, 1000),
        tokensUsed,
        accepted: true,
      },
    }).catch(() => {});

    let createdDocId: string | null = null;

    // Optional 1-click Save as Document
    if (saveAsDoc) {
      const docTitle = `Executive Briefing - ${new Date().toISOString().split("T")[0]}`;
      // Convert markdown text to basic Tiptap structure
      const paragraphs = summaryText.split("\n\n").map((p) => {
        if (p.startsWith("# ")) {
          return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: p.replace(/^# /, "") }] };
        }
        if (p.startsWith("## ")) {
          return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: p.replace(/^## /, "") }] };
        }
        return { type: "paragraph", content: [{ type: "text", text: p }] };
      });

      const tiptapContent = {
        type: "doc",
        content: paragraphs,
      };

      const newDoc = await prisma.document.create({
        data: {
          workspaceId,
          title: docTitle,
          content: tiptapContent as never,
          authorId: session.user.id,
        },
      });

      createdDocId = newDoc.id;

      const incomingBytes = Buffer.byteLength(JSON.stringify(tiptapContent), "utf8");
      await prisma.$executeRaw`
        UPDATE "Workspace"
        SET "storageUsedBytes" = "storageUsedBytes" + ${incomingBytes}
        WHERE id = ${workspaceId}
      `;
    }

    return NextResponse.json({
      summary: summaryText,
      createdDocId,
      workspaceName: workspace.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[executive-summary] Error:", err);
    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiCreditsUsed: { decrement: 1 } },
    }).catch(() => {});

    return NextResponse.json({ error: "Failed to generate executive summary." }, { status: 500 });
  }
}
