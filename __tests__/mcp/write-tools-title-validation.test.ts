// Feature: web-mcp-integration, Property 8: Write tools reject oversized titles
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodTypeAny } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: { goal: { create: vi.fn() }, task: { create: vi.fn() } },
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

const CTX: AuthenticatedKeyContext = {
  userId: "u1",
  apiKeyId: "k1",
  userPlan: "free",
  workspaceIds: ["ws1"],
};

type ToolEntry = { inputSchema: ZodTypeAny };

function getToolSchema(server: McpServer, name: string): ZodTypeAny {
  const tools = (server as unknown as { _registeredTools: Record<string, ToolEntry> })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  return tool.inputSchema;
}

describe("Property 8: Write tools reject oversized titles", () => {
  it("create_goal input schema rejects title > 255 chars", () => {
    const server = new McpServer({ name: "t", version: "1" });
    registerWriteTools(server, CTX);
    const schema = getToolSchema(server, "create_goal");

    return fc.assert(
      fc.property(fc.string({ minLength: 256 }), (longTitle) => {
        const result = schema.safeParse({
          workspaceId: "ws1",
          title: longTitle,
          objective: "obj",
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 30 }
    );
  });

  it("create_task input schema rejects title > 255 chars", () => {
    const server = new McpServer({ name: "t", version: "1" });
    registerWriteTools(server, CTX);
    const schema = getToolSchema(server, "create_task");

    return fc.assert(
      fc.property(fc.string({ minLength: 256 }), (longTitle) => {
        const result = schema.safeParse({
          workspaceId: "ws1",
          milestoneId: "m1",
          title: longTitle,
        });
        expect(result.success).toBe(false);
      }),
      { numRuns: 30 }
    );
  });
});
