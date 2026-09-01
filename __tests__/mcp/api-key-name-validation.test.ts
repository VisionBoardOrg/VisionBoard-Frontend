// Feature: web-mcp-integration, Property 4: Name validation rejects out-of-range inputs
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user1" } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/user/api-keys/route";

describe("Property 4: Name validation rejects out-of-range inputs", () => {
  it("rejects empty name with 400", async () => {
    const req = new NextRequest("http://localhost/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects names longer than 64 chars with 400", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 65, maxLength: 200 }),
        async (longName) => {
          const req = new NextRequest("http://localhost/api/user/api-keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: longName }),
          });
          const res = await POST(req);
          expect(res.status).toBe(400);
        }
      ),
      { numRuns: 30 }
    );
  });
});
