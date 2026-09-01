// Feature: web-mcp-integration — write tool edge case unit tests
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("server-only", () => ({}));

const mockFindFirst = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findFirst: mockFindFirst, update: mockUpdate },
    document: { create: vi.fn() },
    workspace: { findUnique: mockFindUnique },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn().mockResolvedValue({ ok: true, isOwner: false, member: { role: "pm" } }),
}));
vi.mock("@/lib/plan-limits", () => ({
  checkPlanLimit: vi.fn().mockReturnValue({ allowed: true }),
  checkStorageLimit: vi.fn().mockReturnValue({ allowed: true }),
  PLAN_LIMITS: { free: { storageMb: null } },
}));
vi.mock("@/lib/ai/indexer", () => ({
  indexSingleEntity: vi.fn().mockResolvedValue(undefined),
}));

import { registerWriteTools } from "@/lib/mcp/tools/write-tools";
import type { AuthenticatedKeyContext } from "@/lib/mcp/auth";

const CTX: AuthenticatedKeyContext = {
  userId: "u1",
  apiKeyId: "k1",
  userPlan: "free",
  workspaceIds: ["ws1"],
};

type ToolEntry = { callback: (args: unknown) => Promise<unknown> };
type ToolResult = { isError?: boolean; content: { text: string }[] };

function callTool(server: McpServer, name: string, args: Record<string, unknown>) {
  const tools = (server as unknown as { _registeredTools: Record<string, ToolEntry> })._registeredTools;
  return tools[name]!.callback(args) as Promise<ToolResult>;
}

describe("18.3: Write tool edge cases", () => {
  it("update_task_status: returns error when taskId is from a different workspace", async () => {
    mockFindFirst.mockResolvedValue(null); // task not found in this workspace
    const server = new McpServer({ name: "t", version: "1" });
    registerWriteTools(server, CTX);

    const result = await callTool(server, "update_task_status", {
      workspaceId: "ws1",
      taskId: "task-in-other-ws",
      status: "done",
    });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text) as { error: string };
    expect(body.error).toContain("not found");
  });
});
