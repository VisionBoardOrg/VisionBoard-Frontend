import { describe, it, expect } from "vitest";
import { renderNotificationEmail } from "@/lib/email/templates/notification-email-template";

describe("renderNotificationEmail", () => {
  const baseInput = {
    notification: {
      id: "notif_123",
      type: "task_assigned",
      title: "Complete quarterly roadmap",
      message: "Sarah assigned you to 'Complete quarterly roadmap'",
      link: "/workspace/ws_1/tasks?taskId=task_99",
      metadata: { taskId: "task_99" },
    },
    recipient: {
      name: "Alex Johnson",
      email: "alex@example.com",
    },
    actor: {
      name: "Sarah Miller",
      email: "sarah@example.com",
    },
    workspaceName: "Acme Product Team",
    unsubscribeUrl: "https://vision-board.tech/api/notifications/unsubscribe?token=tok_abc",
    preferencesUrl: "https://vision-board.tech/account",
    appUrl: "https://vision-board.tech",
  };

  it("renders task assignment notification email correctly", () => {
    const result = renderNotificationEmail(baseInput);

    expect(result.subject).toContain("[Acme Product Team]");
    expect(result.subject).toContain("Sarah Miller assigned you to \"Complete quarterly roadmap\"");
    expect(result.html).toContain("Task Assigned");
    expect(result.html).toContain("Complete quarterly roadmap");
    expect(result.html).toContain("Hi Alex Johnson,");
    expect(result.html).toContain("View Task &rarr;");
    expect(result.html).toContain("https://vision-board.tech/workspace/ws_1/tasks?taskId=task_99");
    expect(result.html).toContain(baseInput.unsubscribeUrl);
    expect(result.html).toContain(baseInput.preferencesUrl);

    // Plain text alternative
    expect(result.text).toContain("TASK ASSIGNED");
    expect(result.text).toContain("Access in VisionBoard:");
    expect(result.text).toContain("One-Click Unsubscribe:");
  });

  it("renders mention notification email correctly", () => {
    const result = renderNotificationEmail({
      ...baseInput,
      notification: {
        ...baseInput.notification,
        type: "comment_mention",
        title: "Database Index Tuning",
        message: "Sarah mentioned you: 'Can you check these query plans?'",
      },
    });

    expect(result.subject).toContain("Sarah Miller mentioned you: \"Database Index Tuning\"");
    expect(result.html).toContain("Mentioned You");
    expect(result.html).toContain("Reply to Comment");
  });

  it("renders overdue task notification email correctly", () => {
    const result = renderNotificationEmail({
      ...baseInput,
      notification: {
        ...baseInput.notification,
        type: "task_overdue",
        title: "Security Audit Checklist",
        message: "'Security Audit Checklist' was due on Sep 15 and is incomplete.",
      },
      actor: null,
    });

    expect(result.subject).toContain("Overdue: Security Audit Checklist");
    expect(result.html).toContain("Task Overdue");
    expect(result.html).toContain("Resolve Overdue Task");
  });

  it("renders goal health alert correctly", () => {
    const result = renderNotificationEmail({
      ...baseInput,
      notification: {
        ...baseInput.notification,
        type: "goal_at_risk",
        title: "Launch Mobile App MVP",
        message: "Goal health dropped to 42%. Two blocking milestones are delayed.",
      },
    });

    expect(result.subject).toContain("Health Alert: Launch Mobile App MVP");
    expect(result.html).toContain("Goal Health Alert");
    expect(result.html).toContain("View Goal Health");
  });

  it("escapes malicious HTML characters in inputs", () => {
    const maliciousInput = {
      ...baseInput,
      notification: {
        ...baseInput.notification,
        title: "<script>alert('xss')</script>Safe Title",
        message: "Test <img src=x onerror=alert(1)> message",
      },
      recipient: {
        name: "User<script>",
        email: "safe@example.com",
      },
    };

    const result = renderNotificationEmail(maliciousInput);

    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<img src=x");
    expect(result.html).toContain("&lt;img src=x");
  });
});
