// Feature: web-mcp-integration — MCP route auth flow unit tests
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockApiKeyAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/auth", () => ({ apiKeyAuth: mockApiKeyAuth }));
vi.mock("@/lib/mcp/rate-limit", () => ({
  mcpRateLimit: vi.fn().mockResolvedValue({ allowed: true, resetSec: 0 }),
}));
vi.mock("@/lib/mcp/server", () => ({
  createMcpServer: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
    handleRequest: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { apiKey: { update: vi.fn() } } }));

import { POST } from "@/app/api/mcp/route";

const VALID_CTX = {
  userId: "u1",
  apiKeyId: "k1",
  userPlan: "free",
  workspaceIds: ["ws1"],
};

function makeRequest(auth?: string) {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("18.4: MCP route auth flow", () => {
  it("returns 401 when apiKeyAuth returns null", async () => {
    mockApiKeyAuth.mockResolvedValue(null);
    const res = await POST(makeRequest("Bearer bad-token"));
    expect(res.status).toBe(401);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when user has no workspace memberships", async () => {
    mockApiKeyAuth.mockResolvedValue({ ...VALID_CTX, workspaceIds: [] });
    const res = await POST(makeRequest("Bearer valid-token"));
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("No accessible workspaces");
  });

  it("proceeds to transport when auth is valid", async () => {
    mockApiKeyAuth.mockResolvedValue(VALID_CTX);
    const res = await POST(makeRequest("Bearer valid-token"));
    // The mocked transport.handleRequest is a no-op so we get a 200 with empty body
    expect(res.status).toBe(200);
  });
});
