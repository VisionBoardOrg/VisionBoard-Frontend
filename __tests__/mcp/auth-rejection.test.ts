// Feature: web-mcp-integration, Property 3: Revoked and expired keys are always rejected
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

// Mock prisma before importing the module under test
vi.mock("@/lib/prisma", () => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    workspaceMember: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("server-only", () => ({}));

import { apiKeyAuth } from "@/lib/mcp/auth";
import { prisma } from "@/lib/prisma";

const mockFindFirst = vi.mocked(prisma.apiKey.findFirst);

const BASE_KEY = {
  id: "key1",
  userId: "user1",
  keyHash: "abc",
  revokedAt: null,
  expiresAt: null,
  user: { plan: "free" as const },
};

describe("Revoked and expired key rejection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always rejects revoked keys regardless of token", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 8 }), async () => {
        mockFindFirst.mockResolvedValue({
          ...BASE_KEY,
          revokedAt: new Date(),
        } as never);
        const result = await apiKeyAuth("Bearer vsn_live_abc123456789012345678901234567890123456789012345678901234567");
        expect(result).toBeNull();
      }),
      { numRuns: 30 }
    );
  });

  it("always rejects expired keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ max: new Date(Date.now() - 1000) }),
        async (expiredDate) => {
          mockFindFirst.mockResolvedValue({
            ...BASE_KEY,
            expiresAt: expiredDate,
          } as never);
          const result = await apiKeyAuth("Bearer vsn_live_abc123456789012345678901234567890123456789012345678901234567");
          expect(result).toBeNull();
        }
      ),
      { numRuns: 30 }
    );
  });

  it("returns null when header is absent", async () => {
    const result = await apiKeyAuth(null);
    expect(result).toBeNull();
  });

  it("returns null when header is malformed", async () => {
    const result = await apiKeyAuth("NotBearer token");
    expect(result).toBeNull();
  });
});
