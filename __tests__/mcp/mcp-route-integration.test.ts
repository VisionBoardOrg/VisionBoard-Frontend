// Feature: web-mcp-integration — MCP route integration (auth + rate limit wiring)
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockApiKeyAuth = vi.hoisted(() => vi.fn());
const mockMcpRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/mcp/auth", () => ({ apiKeyAuth: mockApiKeyAuth }));
vi.mock("@/lib/mcp/rate-limit", () => ({ mcpRateLimit: mockMcpRateLimit }));
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

function makeReq() {
  return new NextRequest("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer vsn_live_abc",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

describe("18.5: MCP route — rate limit and proxy bypass wiring", () => {
  it("returns MCP error with Retry-After header when general rate limit is exceeded", async () => {
    mockApiKeyAuth.mockResolvedValue(VALID_CTX);
    mockMcpRateLimit.mockResolvedValue({
      allowed: false,
      resetSec: 720,
      mcpErrorResponse: {
        jsonrpc: "2.0",
        error: { code: -32429, message: "Rate limit exceeded. Retry in 720 seconds." },
        id: null,
      },
    });

    const res = await POST(makeReq());
    expect(res.status).toBe(200); // MCP errors are HTTP 200 with error body
    expect(res.headers.get("Retry-After")).toBe("720");
    const body = await res.json() as { error: { code: number } };
    expect(body.error.code).toBe(-32429);
  });

  it("proceeds past rate limit when allowed", async () => {
    mockApiKeyAuth.mockResolvedValue(VALID_CTX);
    mockMcpRateLimit.mockResolvedValue({ allowed: true, resetSec: 0 });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
  });
});
