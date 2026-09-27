import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { isValidEmail, parseName, computeUserProperties, RESEND_SEGMENTS, syncUserToResend, removeUserFromResend } from "@/lib/resend-sync";

// Mock resend
vi.mock("resend", () => {
  return {
    Resend: vi.fn().mockImplementation(() => ({
      contacts: {
        create: vi.fn().mockResolvedValue({
          data: { id: "test-contact-123" },
          error: null,
        }),
        update: vi.fn().mockResolvedValue({
          data: { id: "test-contact-123" },
          error: null,
        }),
        remove: vi.fn().mockResolvedValue({
          data: { deleted: true },
          error: null,
        }),
      },
      audiences: {
        list: vi.fn().mockResolvedValue({
          data: { data: [{ id: "test-aud-1", name: "General" }] },
          error: null,
        }),
      },
    })),
  };
});

describe("lib/resend-sync", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_12345";
    process.env.RESEND_AUDIENCE_ID = "test-aud-1";
  });

  describe("isValidEmail", () => {
    it("validates standard email addresses correctly", () => {
      expect(isValidEmail("user@example.com")).toBe(true);
      expect(isValidEmail("dan.davinci@gmail.com")).toBe(true);
      expect(isValidEmail("user+tag@domain.co.uk")).toBe(true);
    });

    it("rejects invalid emails", () => {
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail("not-an-email")).toBe(false);
      expect(isValidEmail("@example.com")).toBe(false);
      expect(isValidEmail("user@")).toBe(false);
    });
  });

  describe("parseName", () => {
    it("splits single name", () => {
      expect(parseName("Dan")).toEqual({ firstName: "Dan" });
    });

    it("splits full name into firstName and lastName", () => {
      expect(parseName("Dan Davinci")).toEqual({
        firstName: "Dan",
        lastName: "Davinci",
      });
    });

    it("handles multiple spaces and names", () => {
      expect(parseName("Victor   Oluwa  Aresa")).toEqual({
        firstName: "Victor",
        lastName: "Oluwa Aresa",
      });
    });

    it("strips HTML/script tags safely", () => {
      expect(parseName("<script>alert(1)</script>John Doe")).toEqual({
        firstName: "John",
        lastName: "Doe",
      });
    });

    it("handles empty or null name", () => {
      expect(parseName(null)).toEqual({});
      expect(parseName("")).toEqual({});
      expect(parseName("   ")).toEqual({});
    });
  });

  describe("RESEND_SEGMENTS", () => {
    it("defines General, Free Tier, and Paying Customers segment IDs", () => {
      expect(RESEND_SEGMENTS.GENERAL).toBeDefined();
      expect(RESEND_SEGMENTS.FREE_TIER).toBeDefined();
      expect(RESEND_SEGMENTS.PAYING_CUSTOMERS).toBeDefined();
    });
  });

  describe("computeUserProperties", () => {
    it("computes default properties for unverified free member", () => {
      const props = computeUserProperties({
        plan: null,
        emailVerified: null,
        createdAt: new Date(),
        aiCreditsUsed: null,
        _count: { ownedWorkspaces: 0 },
      });

      expect(props).toEqual({
        plan: "free",
        role: "member",
        stage: "unverified",
        verification_status: "unverified",
        ai_credits_used: 0,
      });
    });

    it("computes properties for newly registered verified workspace owner", () => {
      const now = new Date();
      const props = computeUserProperties({
        plan: "growth",
        emailVerified: now,
        createdAt: now,
        aiCreditsUsed: 42,
        _count: { ownedWorkspaces: 2 },
      });

      expect(props).toEqual({
        plan: "growth",
        role: "owner",
        stage: "new",
        verification_status: "verified",
        ai_credits_used: 42,
      });
    });

    it("computes active stage for older verified accounts", () => {
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const props = computeUserProperties({
        plan: "startup",
        emailVerified: oldDate,
        createdAt: oldDate,
        aiCreditsUsed: 10,
        isOwner: true,
      });

      expect(props).toEqual({
        plan: "startup",
        role: "owner",
        stage: "active",
        verification_status: "verified",
        ai_credits_used: 10,
      });
    });
  });

  describe("syncUserToResend", () => {
    it("successfully creates contact", async () => {
      const res = await syncUserToResend({
        id: "usr_123",
        email: "dan@example.com",
        name: "Dan Davinci",
      });

      expect(res.success).toBe(true);
      expect(res.contactId).toBe("test-contact-123");
    });

    it("skips if email is invalid", async () => {
      const res = await syncUserToResend({
        id: "usr_123",
        email: "not-an-email",
      });

      expect(res.success).toBe(false);
      expect(res.skipped).toBe(true);
    });
  });

  describe("removeUserFromResend", () => {
    it("removes contact with valid email", async () => {
      const ok = await removeUserFromResend("dan@example.com");
      expect(ok).toBe(true);
    });

    it("returns false for invalid email", async () => {
      const ok = await removeUserFromResend("not-an-email");
      expect(ok).toBe(false);
    });
  });
});
