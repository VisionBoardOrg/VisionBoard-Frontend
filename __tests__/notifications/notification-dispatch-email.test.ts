import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNotification, dispatchNotificationEmailAsync } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import * as emailService from "@/lib/email/email-service";
import * as notifPreferences from "@/lib/notification-preferences";
import * as notifEvents from "@/lib/notification-events";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    workspace: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notification-events", () => ({
  emitLiveNotification: vi.fn().mockResolvedValue(undefined),
}));

describe("createNotification and email dispatch integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses self-notifications when actorId === userId", async () => {
    const result = await createNotification({
      userId: "user_same",
      actorId: "user_same",
      type: "task_assigned",
      title: "Self Task",
      message: "You assigned a task to yourself",
    });

    expect(result).toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("persists in-app notification and triggers live SSE and email dispatch", async () => {
    const mockCreated = {
      id: "notif_456",
      userId: "user_recipient",
      workspaceId: "ws_789",
      actorId: "user_actor",
      type: "comment_mention" as const,
      title: "Alice mentioned you",
      message: "Check this out",
      entityType: "task",
      entityId: "task_1",
      link: "/workspace/ws_789/tasks?taskId=task_1",
      read: false,
      readAt: null,
      metadata: {},
      createdAt: new Date(),
      actor: { id: "user_actor", name: "Alice", image: null, email: "alice@example.com" },
    };

    vi.mocked(prisma.notification.create).mockResolvedValue(mockCreated as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_recipient",
      name: "Bob",
      email: "bob@example.com",
    } as any);
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      name: "Acme Corp",
    } as any);

    const sendEmailSpy = vi
      .spyOn(emailService, "sendEmailWithRetry")
      .mockResolvedValue({
        success: true,
        messageId: "msg_123",
        provider: "console",
        attempts: 1,
      });

    vi.spyOn(notifPreferences, "shouldSendEmailForNotification").mockResolvedValue({
      shouldSend: true,
      preferences: {
        id: "pref_1",
        userId: "user_recipient",
        emailEnabled: true,
        tasks: true,
        mentions: true,
        comments: true,
        goalsMilestones: true,
        quotasBilling: true,
        systemAlerts: true,
        typeOverrides: null,
        unsubscribeToken: "token_xyz",
      },
    });

    const notification = await createNotification({
      userId: "user_recipient",
      actorId: "user_actor",
      workspaceId: "ws_789",
      type: "comment_mention",
      title: "Alice mentioned you",
      message: "Check this out",
      entityType: "task",
      entityId: "task_1",
      link: "/workspace/ws_789/tasks?taskId=task_1",
    });

    expect(notification).toBeDefined();
    expect(notification?.id).toBe("notif_456");
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(notifEvents.emitLiveNotification).toHaveBeenCalledTimes(1);

    // Give microtask queue a tick to allow the fire-and-forget dispatch to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(sendEmailSpy).toHaveBeenCalled();
    expect(sendEmailSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "bob@example.com",
        subject: expect.stringContaining("Alice mentioned you"),
        unsubscribeUrl: expect.stringContaining("token_xyz"),
      })
    );
  });

  it("guarantees zero disruption to in-app notification if email service fails", async () => {
    const mockCreated = {
      id: "notif_789",
      userId: "user_recipient",
      workspaceId: null,
      actorId: "user_actor",
      type: "task_assigned" as const,
      title: "New Task Assigned",
      message: "You got a task",
      entityType: "task",
      entityId: "task_2",
      link: "/tasks",
      read: false,
      readAt: null,
      metadata: {},
      createdAt: new Date(),
      actor: { id: "user_actor", name: "Alice", image: null, email: "alice@example.com" },
    };

    vi.mocked(prisma.notification.create).mockResolvedValue(mockCreated as any);
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("Database connection lost for user query"));

    // Calling createNotification should still succeed without throwing
    const notification = await createNotification({
      userId: "user_recipient",
      actorId: "user_actor",
      type: "task_assigned",
      title: "New Task Assigned",
      message: "You got a task",
    });

    expect(notification).toBeDefined();
    expect(notification?.id).toBe("notif_789");
    expect(notifEvents.emitLiveNotification).toHaveBeenCalled();
  });
});
