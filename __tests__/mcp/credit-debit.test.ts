// Feature: web-mcp-integration, Property 10: AI credit debit/refund invariant
import { describe, it, expect, vi, beforeEach } from "vitest";
import fc from "fast-check";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("server-only", () => ({}));

import { debitCredit, refundCredit } from "@/lib/ai/credit-debit";
import { prisma } from "@/lib/prisma";

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockUpdateMany = vi.mocked(prisma.user.updateMany);
const mockUpdate = vi.mocked(prisma.user.update);

describe("Credit debit/refund invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'debited' when CAS succeeds (count = 1)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 9 }), async (creditsUsed) => {
        mockFindUnique.mockResolvedValue({ plan: "startup", aiCreditsUsed: creditsUsed } as never);
        mockUpdateMany.mockResolvedValue({ count: 1 } as never);
        const result = await debitCredit("user1");
        expect(result).toBe("debited");
      }),
      { numRuns: 50 }
    );
  });

  it("returns 'exceeded' when CAS fails (count = 0)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 100 }), async (creditsUsed) => {
        mockFindUnique.mockResolvedValue({ plan: "startup", aiCreditsUsed: creditsUsed } as never);
        mockUpdateMany.mockResolvedValue({ count: 0 } as never);
        const result = await debitCredit("user1");
        expect(result).toBe("exceeded");
      }),
      { numRuns: 50 }
    );
  });

  it("returns 'unlimited' for null-limit plans and still increments", async () => {
    mockFindUnique.mockResolvedValue({ plan: "enterprise", aiCreditsUsed: 0 } as never);
    mockUpdate.mockResolvedValue({} as never);
    const result = await debitCredit("user1");
    expect(result).toBe("unlimited");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aiCreditsUsed: { increment: 1 } } })
    );
  });

  it("returns 'exceeded' when user is not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await debitCredit("user1");
    expect(result).toBe("exceeded");
  });

  it("refundCredit swallows errors gracefully", async () => {
    mockUpdateMany.mockRejectedValue(new Error("DB down"));
    await expect(refundCredit("user1")).resolves.toBeUndefined();
  });
});
