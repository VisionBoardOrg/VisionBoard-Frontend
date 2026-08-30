import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import OpenAI from "openai";
import { z } from "zod";
import { createHash } from "crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchWorkspaceKnowledge, RetrievedChunk } from "@/lib/ai/semantic-search";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
});

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";

const schema = z.object({
  workspaceId: z.string(),
  message: z.string().min(1).max(3000),
  conversationId: z.string().optional(),
});

function hashPrompt(input: string): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

export async function POST(request: NextRequest) {
  // Rate limit: AI generation routes are expensive (embedding search + LLM call)
  const rateLimit = await checkRateLimit(request, "ai-copilot-chat", {
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

  const { workspaceId, message, conversationId } = parsed.data;

  // Run membership and user plan fetch in parallel
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

  // Retrieve or create Conversation thread
  let conversation: { id: string } | null = null;
  if (conversationId) {
    conversation = await prisma.copilotConversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
  }

  if (!conversation) {
    const threadTitle = message.slice(0, 40) + (message.length > 40 ? "…" : "");
    conversation = await prisma.copilotConversation.create({
      data: {
        workspaceId,
        userId: session.user.id,
        title: threadTitle,
      },
      select: { id: true },
    });
  }

  // F-23: Save user message first, then fetch history — guarantees the
  // findMany sees the committed row and the temporal filter is unambiguous.
  const savedUserMessage = await prisma.copilotMessage.create({
    data: { conversationId: conversation.id, role: "user", content: message },
    select: { id: true, createdAt: true },
  });

  // Fetch the 5 messages that came BEFORE the one we just inserted.
  const recentMessages = await prisma.copilotMessage.findMany({
    where: {
      conversationId: conversation.id,
      createdAt: { lt: savedUserMessage.createdAt },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const history = recentMessages.reverse();

  // 1. Semantic RAG Search across workspace knowledge base
  const retrievedChunks: RetrievedChunk[] = await searchWorkspaceKnowledge(workspaceId, message, {
    limit: 6,
    minSimilarity: 0.15,
  });

  // 2. Fetch live workspace operational context
  const [activeGoalsCount, delayedMilestonesCount, blockedTasks, overdueTasksCount] = await Promise.all([
    prisma.goal.count({ where: { workspaceId, status: "active" } }),
    prisma.milestone.count({ where: { goal: { workspaceId }, status: "delayed" } }),
    prisma.task.findMany({
      where: { milestone: { goal: { workspaceId } }, status: "blocked" },
      select: { id: true, title: true, blockedReason: true },
      take: 5,
    }),
    prisma.task.count({
      where: {
        milestone: { goal: { workspaceId } },
        dueDate: { lt: new Date() },
        status: { notIn: ["done"] },
      },
    }),
  ]);

  const citationsForClient = retrievedChunks.map((chunk) => ({
    id: chunk.id,
    entityType: chunk.entityType,
    entityId: chunk.entityId,
    title: chunk.title,
    snippet: chunk.content.slice(0, 160) + (chunk.content.length > 160 ? "…" : ""),
    url: chunk.url,
  }));

  // Construct context prompt
  const ragContext = retrievedChunks.length > 0
    ? retrievedChunks
        .map(
          (c, i) =>
            `[Knowledge Chunk ${i + 1}]:\nType: ${c.entityType}\nID: ${c.entityId}\nTitle: ${c.title}\nContent:\n${c.content}`
        )
        .join("\n\n---\n\n")
    : "No direct matching knowledge chunks found in workspace index.";

  const liveStateContext = `
Live Workspace Snapshot:
- Active Goals: ${activeGoalsCount}
- Delayed Milestones: ${delayedMilestonesCount}
- Blocked Tasks: ${blockedTasks.length} ${blockedTasks.map((t) => `("${t.title}" - reason: ${t.blockedReason || "unspecified"})`).join("; ")}
- Overdue Tasks: ${overdueTasksCount}
Today's Date: ${new Date().toISOString().split("T")[0]}
`;

  const systemPrompt = `You are VisionBoard AI Copilot, a brilliant Chief Product Officer (CPO) and Technical Project Lead embedded directly in this workspace.
You have direct semantic access to the team's PRDs, documents, goals, milestones, tasks, and sprint data.

Guidelines:
1. Answer the user's questions with actionable, strategic, and direct insights.
2. Ground your answers in the provided knowledge chunks and live snapshot.
3. CITATION FORMAT: When referencing any document, task, goal, or milestone from context, format the citation inline exactly as:
   [[cite:entityType:entityId:Title]]
   For example:
   "According to the PRD [[cite:document:cl1234:Stripe Integration]] and the open blocker on [[cite:task:cl5678:Webhook Auth]]..."
4. Maintain a clean, professional, and empowering tone. Use markdown bullet points, bold key terms, and structured sections where helpful.
5. If the user asks you to draft a PRD, tech spec, or breakdown, provide a comprehensive, high-quality, production-ready specification.`;

  const promptMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Workspace Retrieved Context:\n${ragContext}\n\n${liveStateContext}`,
    },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  // Set up SSE Stream
  const encoder = new TextEncoder();
  const convId = conversation.id;

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Emit start event with conversation ID and citations
      const startPayload = JSON.stringify({
        type: "start",
        conversationId: convId,
        citations: citationsForClient,
      });
      controller.enqueue(encoder.encode(`data: ${startPayload}\n\n`));

      let fullResponseText = "";
      let totalTokens = 0;

      try {
        const aiStream = await openrouter.chat.completions.create({
          model: OPENROUTER_MODEL,
          messages: promptMessages,
          stream: true,
          max_tokens: 3000,
          // F-24: request usage stats in the final stream chunk so we record
          // real token counts rather than a character-count approximation.
          stream_options: { include_usage: true },
        });

        let promptTokens     = 0;
        let completionTokens = 0;

        for await (const chunk of aiStream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponseText += delta;
            const chunkPayload = JSON.stringify({ type: "chunk", text: delta });
            controller.enqueue(encoder.encode(`data: ${chunkPayload}\n\n`));
          }
          // Capture usage from the final [DONE] chunk
          if (chunk.usage) {
            promptTokens     = chunk.usage.prompt_tokens     ?? 0;
            completionTokens = chunk.usage.completion_tokens ?? 0;
          }
        }

        // Use real token counts when available; fall back to char-count estimate
        totalTokens = (promptTokens + completionTokens) > 0
          ? promptTokens + completionTokens
          : Math.ceil((message.length + fullResponseText.length) / 4);

        // Save Assistant message in database
        const assistantMsg = await prisma.copilotMessage.create({
          data: {
            conversationId: convId,
            role: "assistant",
            content: fullResponseText,
            citations: citationsForClient as never,
            tokensUsed: totalTokens,
          },
        });

        // Audit Log — store only a hash of the output, never raw content.
        // Raw model responses can contain sensitive workspace data (budget
        // figures, PII from PRDs, internal roadmap details) that would be
        // exported verbatim via the data-export endpoint and amplify any
        // AIGenerationLog breach.  The hash preserves auditability without
        // storing the content itself.
        prisma.aIGenerationLog.create({
          data: {
            workspaceId,
            userId: session.user.id,
            feature: "workspace_copilot",
            promptInput: hashPrompt(message),
            modelOutput: hashPrompt(fullResponseText),
            tokensUsed: totalTokens,
            accepted: true,
          },
        }).catch(() => {});

        // Emit done event
        const donePayload = JSON.stringify({
          type: "done",
          messageId: assistantMsg.id,
          conversationId: convId,
        });
        controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`));
        controller.close();
      } catch (err) {
        console.error("[copilot/chat] Stream error:", err);
        // Refund credit if the response was empty or too short to be useful.
        // The original guard only refunded on zero-length responses, which
        // meant a 3-word partial response before a connection drop still billed
        // a full credit.  We now treat anything under 20 characters or with
        // zero recorded tokens as a failed generation.
        const isUsefulResponse = fullResponseText.length >= 20 && totalTokens > 0;
        if (!isUsefulResponse) {
          await prisma.user.update({
            where: { id: session.user.id },
            data: { aiCreditsUsed: { decrement: 1 } },
          }).catch(() => {});
        }
        const errorPayload = JSON.stringify({
          type: "error",
          error: "AI generation encountered an issue.",
        });
        controller.enqueue(encoder.encode(`data: ${errorPayload}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
