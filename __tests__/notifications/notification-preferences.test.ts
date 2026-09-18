import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCategoryForType,
  shouldSendEmailForNotification,
  unsubscribeByToken,
} from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

describe("notification-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCategoryForType", () => {
    it("maps types to correct categories", () => {
      expect(getCategoryForType("task_assigned")).toBe("tasks");
      expect(getCategoryForType("task_blocked")).toBe("tasks");
      expect(getCategoryForType("task_overdue")).toBe("tasks");
      expect(getCategoryForType("comment_mention")).toBe("mentions");
      expect(getCategoryForType("comment_created")).toBe("comments");
      expect(getCategoryForType("milestone_delayed")).toBe("goalsMilestones");
      expect(getCategoryForType("goal_health_degraded")).toBe("goalsMilestones");
      expect(getCategoryForType("quota_warning")).toBe("quotasBilling");
      expect(getCategoryForType("billing_payment_failed")).toBe("quotasBilling");
      expect(getCategoryForType("workspace_invite")).toBe("systemAlerts");
      expect(getCategoryForType("role_changed")).toBe("systemAlerts");
    });
  });

  describe("shouldSendEmailForNotification", () => {
    it("returns false when master emailEnabled toggle is false", async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: false,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "tok_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await shouldSendEmailForNotification("user_1", "task_assigned");
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("master_email_disabled");
    });

    it("returns false when the specific category is disabled", async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: true,
        tasks: false, // Tasks disabled
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "tok_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await shouldSendEmailForNotification("user_1", "task_assigned");
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("category_tasks_disabled");
    });

    it("returns true when category is enabled", async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: true,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "tok_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await shouldSendEmailForNotification("user_1", "comment_mention");
      expect(result.shouldSend).toBe(true);
    });

    it("respects fine-grained typeOverrides", async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: true,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: {
          task_due_soon: false, // specifically opted out of due soon
        },
        unsubscribeToken: "tok_123",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await shouldSendEmailForNotification("user_1", "task_due_soon");
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe("type_override_disabled");
    });
  });

  describe("unsubscribeByToken", () => {
    it("disables email notifications for valid token", async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: true,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "valid_tok",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.notificationPreference.update).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: false,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "valid_tok",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await unsubscribeByToken("valid_tok");
      expect(result.success).toBe(true);
      expect(result.preferences?.emailEnabled).toBe(false);
      expect(prisma.notificationPreference.update).toHaveBeenCalledWith({
        where: { id: "pref_1" },
        data: { emailEnabled: false },
      });
    });

    it("returns error for invalid token", async () => {
      vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);

      const result = await unsubscribeByToken("invalid_tok");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid or expired");
    });
  });
});
