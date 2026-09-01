// Feature: web-mcp-integration, Property 9: update_task_status rejects invalid enum values
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { task: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn().mockResolvedValue({ ok: true, isOwner: false, member: {} }),
}));
vi.mock("@/lib/plan-limits", () => ({
  checkPlanLimit: vi.fn(),
  checkStorageLimit: vi.fn(),
  PLAN_LIMITS: {},
}));
vi.mock("@/lib/ai/indexer", () => ({ indexSingleEntity: vi.fn() }));

import { registerWriteTools } from "@/lib/mcp/tools/write-tools";
import type { AuthenticatedKeyContext } from "@/lib/mcp/auth";

const VALID_STATUSES = ["todo", "in_progress", "in_review", "blocked", "done"];
const CTX: AuthenticatedKeyContext = {
  userId: "u1",
  apiKeyId: "k1",
  userPlan: "free",
  workspaceIds: ["ws1"],
};

type ToolEntry = { callback: (args: unknown) => Promise<unknown> };
type ToolResult = { isError?: boolean };

function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  const tools = (server as unknown as { _registeredTools: Record<string, ToolEntry> })._registeredTools;
  return tools[name]!.callback(args) as Promise<ToolResult>;
}

describe("Property 9: update_task_status rejects invalid status values", () => {
  it("returns isError for any status not in the TaskStatus enum", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !VALID_STATUSES.includes(s) && s.length > 0),
        async (badStatus) => {
          const server = new McpServer({ name: "t", version: "1" });
          registerWriteTools(server, CTX);
          const result = await callTool(server, "update_task_status", {
            workspaceId: "ws1",
            taskId: "t1",
            status: badStatus,
          });
          expect(result.isError).toBe(true);
        }
      ),
      { numRuns: 30 }
    );
  });
});
