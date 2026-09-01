import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/require-role";
import { checkPlanLimit, checkStorageLimit } from "@/lib/plan-limits";
import { indexSingleEntity } from "@/lib/ai/indexer";
import type { AuthenticatedKeyContext } from "../auth";

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Success response — MCP tool result with JSON text payload. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

/** Error response — MCP tool result flagged as an error. */
function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ── Input schemas ──────────────────────────────────────────────────────────

const createGoalShape = {
  workspaceId: z.string(),
  title: z.string().min(1).max(255),
  objective: z.string().min(1),
  targetDate: z.string().datetime().optional(),
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
};

const createTaskShape = {
  workspaceId: z.string(),
  milestoneId: z.string(),
  title: z.string().min(1).max(255),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
};

const updateTaskStatusShape = {
  workspaceId: z.string(),
  taskId: z.string(),
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "done"]),
};

const createDocumentShape = {
  workspaceId: z.string(),
  title: z.string().min(1).max(255),
  content: z.unknown().optional(),
};

// ── Tool registration ──────────────────────────────────────────────────────

export function registerWriteTools(server: McpServer, ctx: AuthenticatedKeyContext): void {
  // ── create_goal ──────────────────────────────────────────────────────────
  server.tool(
    "create_goal",
    "Create a new goal in a workspace",
    createGoalShape,
    async (input) => {
      // 1. Zod validation is already enforced by the SDK via the shape above.
      //    Extra coerce for targetDate / keyResults defaults:
      const { workspaceId, title, objective, targetDate, keyResults } = input;

      // 2. Workspace access check
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return err("Workspace not found or access denied.");
      }

      // 3. RBAC
      const roleCheck = await requireRole(ctx.userId, workspaceId, ["pm", "admin", "owner"]);
      if (!roleCheck.ok) {
        return err("Insufficient permissions to create a goal.");
      }

      // 4. Create goal
      const goal = await prisma.goal.create({
        data: {
          workspaceId,
          title,
          objective,
          targetDate: targetDate ? new Date(targetDate) : null,
          keyResults: (keyResults ?? []) as never,
          ownerId: ctx.userId,
        },
        select: { id: true, title: true },
      });

      return ok({ id: goal.id, title: goal.title });
    }
  );

  // ── create_task ──────────────────────────────────────────────────────────
  server.tool(
    "create_task",
    "Create a new task within a milestone",
    createTaskShape,
    async (input) => {
      const { workspaceId, milestoneId, title, priority, assigneeId, dueDate } = input;

      // 1. Workspace access check
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return err("Workspace not found or access denied.");
      }

      // 2. RBAC
      const roleCheck = await requireRole(ctx.userId, workspaceId, [
        "eng",
        "pm",
        "admin",
        "owner",
      ]);
      if (!roleCheck.ok) {
        return err("Insufficient permissions to create a task.");
      }

      // 3. Create task
      const task = await prisma.task.create({
        data: {
          workspaceId,
          milestoneId,
          title,
          priority: priority ?? "medium",
          assigneeId: assigneeId ?? null,
          dueDate: dueDate ? new Date(dueDate) : null,
        },
        select: { id: true, title: true },
      });

      return ok({ id: task.id, title: task.title });
    }
  );

  // ── update_task_status ───────────────────────────────────────────────────
  server.tool(
    "update_task_status",
    "Update the status of an existing task",
    updateTaskStatusShape,
    async (input) => {
      const { workspaceId, taskId, status } = input;

      // 1. Workspace access check
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return err("Workspace not found or access denied.");
      }

      // 2. RBAC
      const roleCheck = await requireRole(ctx.userId, workspaceId, [
        "eng",
        "pm",
        "admin",
        "owner",
      ]);
      if (!roleCheck.ok) {
        return err("Insufficient permissions to update a task.");
      }

      // 3. Verify task belongs to this workspace
      const existing = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true, title: true },
      });
      if (!existing) {
        return err("Task not found in workspace.");
      }

      // 4. Update
      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { status },
        select: { id: true, title: true, status: true },
      });

      return ok({ id: updated.id, title: updated.title, status: updated.status });
    }
  );

  // ── create_document ──────────────────────────────────────────────────────
  server.tool(
    "create_document",
    "Create a new document in a workspace",
    createDocumentShape,
    async (input) => {
      const { workspaceId, title, content } = input;

      // 1. Workspace access check (all members may create documents — no requireRole)
      if (!ctx.workspaceIds.includes(workspaceId)) {
        return err("Workspace not found or access denied.");
      }

      // 2. Compute storage footprint
      const incomingBytes = Buffer.byteLength(JSON.stringify(content ?? {}), "utf8");
      const incomingMb = incomingBytes / (1024 * 1024);

      // 3. Fetch workspace for plan + storage counters
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          storageUsedBytes: true,
          owner: { select: { plan: true } },
          _count: { select: { documents: true } },
        },
      });
      if (!workspace) {
        return err("Workspace not found.");
      }

      const plan = workspace.owner.plan ?? "free";

      // 4. Document count limit
      const countCheck = checkPlanLimit(
        {
          plan,
          currentAiCredits: 0,
          currentMemberCount: 0,
          currentDocumentCount: workspace._count.documents,
          currentWorkspaceCount: 0,
        },
        "create_document"
      );
      if (!countCheck.allowed) {
        return err(countCheck.reason ?? "Document limit reached.");
      }

      // 5. Storage limit
      const currentMb = Number(workspace.storageUsedBytes ?? 0) / (1024 * 1024);
      const storageCheck = checkStorageLimit(plan, currentMb, incomingMb);
      if (!storageCheck.allowed) {
        return err(storageCheck.reason ?? "Storage limit reached.");
      }

      // 6. Atomic create + storage increment
      const [doc] = await prisma.$transaction([
        prisma.document.create({
          data: {
            workspaceId,
            title,
            content: (content ?? {}) as never,
            authorId: ctx.userId,
          },
          select: { id: true, title: true },
        }),
        prisma.$executeRaw`
          UPDATE "Workspace"
          SET "storageUsedBytes" = "storageUsedBytes" + ${incomingBytes}
          WHERE id = ${workspaceId}
        `,
      ]);

      // 7. Background incremental knowledge indexing
      indexSingleEntity(workspaceId, "document", doc.id).catch(() => {});

      return ok({ id: doc.id, title: doc.title });
    }
  );
}
