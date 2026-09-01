// Feature: web-mcp-integration — discovery endpoint unit test
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/.well-known/mcp.json/route";

describe("18.1: MCP discovery endpoint", () => {
  let originalUrl: string | undefined;

  beforeEach(() => {
    originalUrl = process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalUrl;
    }
  });

  it("returns correct structure with Cache-Control header", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.visionboard.io";
    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.mcpVersion).toBe("2025-03-26");
    expect(body.serverUrl).toBe("https://app.visionboard.io/api/mcp");
    expect(body.authScheme).toBe("bearer");
    expect(typeof body.description).toBe("string");
    expect((body.description as string).length).toBeGreaterThan(0);
    expect((body.description as string).length).toBeLessThanOrEqual(256);

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("falls back to localhost when env var is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.serverUrl as string).toContain("localhost");
    expect(body.serverUrl as string).toContain("/api/mcp");
  });
});
