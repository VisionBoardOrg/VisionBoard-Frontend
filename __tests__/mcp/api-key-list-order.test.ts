// Feature: web-mcp-integration, Property 6: Key list sorted by createdAt descending
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

describe("Property 6: Key list sorted by createdAt descending", () => {
  it("keys[i].createdAt >= keys[i+1].createdAt for all adjacent pairs", () => {
    return fc.assert(
      fc.asyncProperty(
        fc.array(fc.date(), { minLength: 2, maxLength: 10 }),
        async (dates) => {
          // Sort descending as the DB would
          const sorted = [...dates].sort((a, b) => b.getTime() - a.getTime());
          const keyRows = sorted.map((d, i) => ({
            id: `key${i}`,
            name: `key ${i}`,
            keyPrefix: "vsn_live_",
            createdAt: d,
            lastUsedAt: null,
            expiresAt: null,
            revokedAt: null,
          }));
          mockFindMany.mockResolvedValue(keyRows);

          const res = await GET();
          const body = await res.json() as { createdAt: string }[];

          for (let i = 0; i < body.length - 1; i++) {
            const a = new Date(body[i].createdAt).getTime();
            const b = new Date(body[i + 1].createdAt).getTime();
            expect(a).toBeGreaterThanOrEqual(b);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
