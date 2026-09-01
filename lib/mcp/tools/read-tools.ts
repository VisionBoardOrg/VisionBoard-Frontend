import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { searchWorkspaceKnowledge } from "@/lib/ai/semantic-search";
import type { AuthenticatedKeyContext } from "../auth";

// ── Shared helpers ────────────────────────────────────────────────────────────

function accessDenied() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: "Workspace not found or access denied." }),
      },
    ],
    isError: true,
  };
}

function internalError(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true,
  };
}

function ok(result: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result),
      },
    ],
  };
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerReadTools(
  server: McpServer,
  ctx: AuthenticatedKeyContext
): void {
  // ── list_workspaces ───────────────────────────────────────────────────────

  server.tool(
    "list_workspaces",
    "List all workspaces the authenticated user is a member of.",
    {},
    async () => {
      try {
        const members = await prisma.workspaceMember.findMany({
          where: { userId: ctx.userId },
          include: {
            workspace: {
              select: { id: true, name: true, slug: true },
            },
          },
        });

        const result = members.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          role: m.role,
        }));

        return ok(result);
      } catch {
        return internalError("Failed to list workspaces.");
      }
    }
  );

  // ── list_goals ────────────────────────────────────────────────────────────

  server.tool(
    "list_goals",
    "List up to 100 goals in a workspace, ordered by creation date (newest first).",
    {
      workspaceId: z.string(),
    },
    async ({ workspaceId }) => {
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return accessDenied();
      }

      try {
        const [goals, activeTaskCount] = await Promise.all([
          prisma.goal.findMany({
            where: { workspaceId },
            select: {
              id: true,
              title: true,
              objective: true,
              status: true,
              healthScore: true,
              targetDate: true,
              createdAt: true,
              _count: { select: { milestones: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 100,
          }),
          prisma.task.count({
            where: {
              workspaceId,
              status: { notIn: ["done"] },
            },
          }),
        ]);

        const result = goals.map((g) => ({
          id: g.id,
          title: g.title,
          objective: g.objective,
          status: g.status,
          healthScore: g.healthScore,
          targetDate: g.targetDate,
          createdAt: g.createdAt,
          milestoneCount: g._count.milestones,
          activeTaskCount,
        }));

        return ok(result);
      } catch {
        return internalError("Failed to list goals.");
      }
    }
  );

  // ── list_tasks ────────────────────────────────────────────────────────────

  server.tool(
    "list_tasks",
    "List up to 500 tasks in a workspace, optionally filtered by milestone or status, ordered by due date (ascending).",
    {
      workspaceId: z.string(),
      milestoneId: z.string().optional(),
      status: z
        .enum(["todo", "in_progress", "in_review", "blocked", "done"])
        .optional(),
    },
    async ({ workspaceId, milestoneId, status }) => {
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return accessDenied();
      }

      try {
        const where = {
          workspaceId,
          ...(milestoneId ? { milestoneId } : {}),
          ...(status ? { status } : {}),
        };

        const tasks = await prisma.task.findMany({
          where,
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            assigneeId: true,
            dueDate: true,
            blockedReason: true,
          },
          orderBy: { dueDate: "asc" },
          take: 500,
        });

        return ok(tasks);
      } catch {
        return internalError("Failed to list tasks.");
      }
    }
  );

  // ── list_documents ────────────────────────────────────────────────────────

  server.tool(
    "list_documents",
    "List documents in a workspace, paginated, ordered by last updated (newest first). Content blob is excluded.",
    {
      workspaceId: z.string(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(50).default(20),
    },
    async ({ workspaceId, page, limit }) => {
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return accessDenied();
      }

      try {
        const [documents, total] = await Promise.all([
          prisma.document.findMany({
            where: { workspaceId },
            select: {
              id: true,
              title: true,
              authorId: true,
              createdAt: true,
              updatedAt: true,
              linkedGoalId: true,
              linkedMilestoneId: true,
              linkedTaskId: true,
            },
            orderBy: { updatedAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
          }),
          prisma.document.count({ where: { workspaceId } }),
        ]);

        return ok({ documents, total, page, limit });
      } catch {
        return internalError("Failed to list documents.");
      }
    }
  );

  // ── search_workspace ──────────────────────────────────────────────────────

  server.tool(
    "search_workspace",
    "Semantic search across a workspace's goals, tasks, documents, and comments. Query must be at least 2 characters.",
    {
      workspaceId: z.string(),
      query: z.string().min(2),
    },
    async ({ workspaceId, query }) => {
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return accessDenied();
      }

      // query.length < 2 is already rejected by Zod, but handle defensively
      if (query.length < 2) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Query must be at least 2 characters.",
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const chunks = await searchWorkspaceKnowledge(workspaceId, query, {
          limit: 6,
          minSimilarity: 0.15,
        });

        const result = chunks.map((chunk) => ({
          title: chunk.title,
          snippet: chunk.content.slice(0, 200),
          entityType: chunk.entityType,
          entityId: chunk.entityId,
          url: chunk.url,
        }));

        return ok(result);
      } catch {
        return internalError("Failed to search workspace.");
      }
    }
  );
}
