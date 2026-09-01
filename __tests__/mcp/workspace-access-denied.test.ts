// Feature: web-mcp-integration, Property 7: Workspace access denied for non-member workspaceId
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspaceMember: { findMany: vi.fn() },
    goal: { findMany: vi.fn() },
    task: { count: vi.fn() },
  },
}));
vi.mock("@/lib/ai/semantic-search", () => ({ searchWorkspaceKnowledge: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/plan-limits", () => ({
  checkPlanLimit: vi.fn(),
  checkStorageLimit: vi.fn(),
  PLAN_LIMITS: { free: { storageMb: 5 } },
}));
vi.mock("@/lib/ai/indexer", () => ({ indexSingleEntity: vi.fn() }));

import { registerReadTools } from "@/lib/mcp/tools/read-tools";
import { registerWriteTools } from "@/lib/mcp/tools/write-tools";
import type { AuthenticatedKeyContext } from "@/lib/mcp/auth";

const CTX: AuthenticatedKeyContext = {
  userId: "u1",
  apiKeyId: "k1",
  userPlan: "free",
  workspaceIds: ["ws-allowed"],
};

type ToolEntry = { callback: (args: unknown) => Promise<unknown> };
type ToolResult = { content: { text: string }[]; isError?: boolean };

function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  // _registeredTools is a plain object keyed by tool name
  const tools = (server as unknown as { _registeredTools: Record<string, ToolEntry> })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.callback(args) as Promise<ToolResult>;
}

describe("Property 7: Workspace access denied for non-member workspaceId", () => {
  it("read tools return error for non-member workspaceId", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !CTX.workspaceIds.includes(s) && s.length > 0),
        async (foreignId) => {
          const server = new McpServer({ name: "t", version: "1" });
          registerReadTools(server, CTX);

          for (const toolName of ["list_goals", "list_tasks", "list_documents", "search_workspace"]) {
            const result = await callTool(server, toolName, {
              workspaceId: foreignId,
              query: "test query",
              status: undefined,
              milestoneId: undefined,
              page: 1,
              limit: 20,
            });
            expect(result.isError).toBe(true);
            const body = JSON.parse(result.content[0].text) as { error: string };
            expect(body.error).toContain("access denied");
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  it("write tools return error for non-member workspaceId", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => !CTX.workspaceIds.includes(s) && s.length > 0),
        async (foreignId) => {
          const server = new McpServer({ name: "t", version: "1" });
          registerWriteTools(server, CTX);

          const result = await callTool(server, "create_goal", {
            workspaceId: foreignId,
            title: "Goal",
            objective: "obj",
          });
          expect(result.isError).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });
});
