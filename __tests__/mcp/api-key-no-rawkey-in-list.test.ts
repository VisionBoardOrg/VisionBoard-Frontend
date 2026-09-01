// Feature: web-mcp-integration, Property 5: rawKey is absent from non-creation responses
import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user1" } }),
}));

const mockFindMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({
  prisma: { apiKey: { findMany: mockFindMany } },
}));

import { GET } from "@/app/api/user/api-keys/route";

describe("Property 5: rawKey absent from GET response", () => {
  it("never returns rawKey or keyHash in the key list", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1 }),
            keyPrefix: fc.constant("vsn_live_"),
            createdAt: fc.date(),
            lastUsedAt: fc.option(fc.date(), { nil: null }),
            expiresAt: fc.option(fc.date(), { nil: null }),
            revokedAt: fc.option(fc.date(), { nil: null }),
          }),
          { maxLength: 5 }
        ),
        async (keyRows) => {
          mockFindMany.mockResolvedValue(keyRows);
          const res = await GET();
          const body = await res.json() as Record<string, unknown>[];
          for (const row of body) {
            expect(row).not.toHaveProperty("rawKey");
            expect(row).not.toHaveProperty("keyHash");
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
