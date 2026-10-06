import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCategoryForType,
  shouldSendEmailForNotification,
  unsubscribeByToken,
  updateUserNotificationPreferences,
} from "@/lib/notification-preferences";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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
        keyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
        keyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
        keyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
        keyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
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
      vi.mocked(prisma.notificationPreference.findFirst).mockResolvedValue({
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
        keyHash: "8e8c0b0f0b4a7e4d1e2c2b4a3c3d2e1f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d",
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
        keyHash: "8e8c0b0f0b4a7e4d1e2c2b4a3c3d2e1f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d",
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
      vi.mocked(prisma.notificationPreference.findFirst).mockResolvedValue(null);

      const result = await unsubscribeByToken("invalid_tok");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid or expired");
    });
  });

  describe("updateUserNotificationPreferences", () => {
    it("upserts preferences with scalar values and converts null typeOverrides to Prisma.JsonNull", async () => {
      vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue({
        id: "pref_1",
        userId: "user_1",
        emailEnabled: false,
        tasks: false,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "token_1",
        keyHash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await updateUserNotificationPreferences("user_1", {
        emailEnabled: false,
        tasks: false,
        typeOverrides: null,
      });

      expect(prisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user_1" },
          update: {
            emailEnabled: false,
            tasks: false,
            typeOverrides: Prisma.JsonNull,
          },
          create: expect.objectContaining({
            userId: "user_1",
            emailEnabled: false,
            tasks: false,
            mentions: true,
            comments: true,
            goalsMilestones: true,
            quotasBilling: true,
            systemAlerts: true,
            typeOverrides: Prisma.JsonNull,
            keyHash: expect.any(String),
            unsubscribeToken: expect.any(String),
          }),
        })
      );

      expect(result.emailEnabled).toBe(false);
      expect(result.tasks).toBe(false);
      expect(result.typeOverrides).toBeNull();
    });
  });
});

