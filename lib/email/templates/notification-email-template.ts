/**
 * lib/email/templates/notification-email-template.ts
 *
 * Reusable, brand-aligned email templates generating both high-fidelity HTML
 * and multi-part plain text for all VisionBoard notification types.
 *
 * Designed with spam score optimization:
 *   - High text-to-HTML balance
 *   - Semantic, standards-compliant inline styles
 *   - Multi-part text fallback
 *   - Clear sender identity and RFC 8058 compliant unsubscribe links
 */

import type { NotificationType } from "@prisma/client";

export interface TemplateInput {
  notification: {
    id: string;
    type: NotificationType | string;
    title: string;
    message: string;
    entityType?: string | null;
    entityId?: string | null;
    link?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: Date | string;
  };
  recipient: {
    name?: string | null;
    email: string;
  };
  actor?: {
    name?: string | null;
    email?: string | null;
  } | null;
  workspaceName?: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
  appUrl?: string;
}

export interface RenderedNotificationEmail {
  subject: string;
  html: string;
  text: string;
}

interface TypeTheme {
  badge: string;
  badgeBg: string;
  badgeColor: string;
  accentColor: string;
  iconText: string;
  actionText: string;
}

/**
 * Return theme tokens according to notification category.
 */
function getTypeTheme(type: string): TypeTheme {
  switch (type) {
    case "task_assigned":
      return {
        badge: "Task Assigned",
        badgeBg: "#dbeafe",
        badgeColor: "#1e40af",
        accentColor: "#2563eb",
        iconText: "📋",
        actionText: "View Task",
      };
    case "task_blocked":
      return {
        badge: "Task Blocked",
        badgeBg: "#fee2e2",
        badgeColor: "#991b1b",
        accentColor: "#dc2626",
        iconText: "🚫",
        actionText: "Inspect Blocked Task",
      };
    case "task_due_soon":
      return {
        badge: "Due Soon",
        badgeBg: "#fef3c7",
        badgeColor: "#92400e",
        accentColor: "#d97706",
        iconText: "⏳",
        actionText: "View Task",
      };
    case "task_overdue":
      return {
        badge: "Task Overdue",
        badgeBg: "#fee2e2",
        badgeColor: "#991b1b",
        accentColor: "#e11d48",
        iconText: "⚠️",
        actionText: "Resolve Overdue Task",
      };
    case "comment_mention":
      return {
        badge: "Mentioned You",
        badgeBg: "#ede9fe",
        badgeColor: "#5b21b6",
        accentColor: "#7c3aed",
        iconText: "💬",
        actionText: "Reply to Comment",
      };
    case "comment_created":
      return {
        badge: "New Comment",
        badgeBg: "#f1f5f9",
        badgeColor: "#334155",
        accentColor: "#475569",
        iconText: "💬",
        actionText: "View Discussion",
      };
    case "milestone_delayed":
      return {
        badge: "Milestone Delayed",
        badgeBg: "#fee2e2",
        badgeColor: "#991b1b",
        accentColor: "#dc2626",
        iconText: "🚨",
        actionText: "Review Milestone",
      };
    case "milestone_completed":
      return {
        badge: "Milestone Achieved",
        badgeBg: "#dcfce7",
        badgeColor: "#166534",
        accentColor: "#16a34a",
        iconText: "🎯",
        actionText: "View Progress",
      };
    case "goal_at_risk":
    case "goal_health_degraded":
      return {
        badge: "Goal Health Alert",
        badgeBg: "#ffedd5",
        badgeColor: "#9a3412",
        accentColor: "#ea580c",
        iconText: "📉",
        actionText: "View Goal Health",
      };
    case "quota_warning":
    case "quota_exceeded":
      return {
        badge: "Workspace Quota Alert",
        badgeBg: "#fef3c7",
        badgeColor: "#92400e",
        accentColor: "#d97706",
        iconText: "📊",
        actionText: "Manage Storage & Plans",
      };
    case "billing_payment_failed":
      return {
        badge: "Payment Failed",
        badgeBg: "#fee2e2",
        badgeColor: "#991b1b",
        accentColor: "#dc2626",
        iconText: "💳",
        actionText: "Update Billing Info",
      };
    case "billing_payment_succeeded":
      return {
        badge: "Payment Successful",
        badgeBg: "#dcfce7",
        badgeColor: "#166534",
        accentColor: "#16a34a",
        iconText: "🧾",
        actionText: "View Invoices",
      };
    case "workspace_invite":
      return {
        badge: "Workspace Invitation",
        badgeBg: "#dbeafe",
        badgeColor: "#1e40af",
        accentColor: "#2563eb",
        iconText: "✉️",
        actionText: "Join Workspace",
      };
    case "role_changed":
      return {
        badge: "Role Updated",
        badgeBg: "#f1f5f9",
        badgeColor: "#334155",
        accentColor: "#2563eb",
        iconText: "🛡️",
        actionText: "Open Workspace",
      };
    default:
      return {
        badge: "Notification",
        badgeBg: "#f1f5f9",
        badgeColor: "#334155",
        accentColor: "#2563eb",
        iconText: "🔔",
        actionText: "Open in VisionBoard",
      };
  }
}

/**
 * Generate formatted subject line based on notification type and title.
 */
function buildSubject(
  type: string,
  title: string,
  workspaceName?: string | null,
  actorName?: string | null
): string {
  const wsPrefix = workspaceName ? `[${workspaceName}] ` : "[VisionBoard] ";

  if (type === "comment_mention" && actorName) {
    return `${wsPrefix}${actorName} mentioned you: "${title}"`;
  }
  if (type === "task_assigned" && actorName) {
    return `${wsPrefix}${actorName} assigned you to "${title}"`;
  }
  if (type === "task_overdue") {
    return `${wsPrefix}Overdue: ${title}`;
  }
  if (type === "task_due_soon") {
    return `${wsPrefix}Due Soon: ${title}`;
  }
  if (type === "goal_health_degraded" || type === "goal_at_risk") {
    return `${wsPrefix}Health Alert: ${title}`;
  }
  if (type === "billing_payment_failed") {
    return `${wsPrefix}Important: Payment failed for your subscription`;
  }

  return `${wsPrefix}${title}`;
}

/**
 * Main template renderer.
 */
export function renderNotificationEmail(input: TemplateInput): RenderedNotificationEmail {
  const {
    notification,
    recipient,
    actor,
    workspaceName,
    unsubscribeUrl,
    preferencesUrl,
    appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-board.tech",
  } = input;

  const type = String(notification.type);
  const theme = getTypeTheme(type);
  const subject = buildSubject(type, notification.title, workspaceName, actor?.name);

  // Deep link URL
  const rawLink = notification.link || "/dashboard";
  const fullTargetUrl = rawLink.startsWith("http")
    ? rawLink
    : `${appUrl.replace(/\/+$/, "")}/${rawLink.replace(/^\/+/, "")}`;

  const recipientGreeting = recipient.name
    ? `Hi ${recipient.name},`
    : "Hello,";

  const actorLabel = actor?.name
    ? `From: <strong>${escapeHtml(actor.name)}</strong>`
    : "";

  // ── Plain Text Alternative ──────────────────────────────────────────────────
  const text = `
VisionBoard Notification
--------------------------------------------------
${theme.badge.toUpperCase()}

${recipientGreeting}

${notification.title}
${notification.message}
${actor?.name ? `Initiated by: ${actor.name}` : ""}

Access in VisionBoard:
${fullTargetUrl}

--------------------------------------------------
Notification Settings: ${preferencesUrl}
One-Click Unsubscribe: ${unsubscribeUrl}
© 2026 VisionBoard Inc.
`.trim();

  // ── High-Fidelity HTML ───────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 0; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 24px 32px; text-align: left;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.025em; text-decoration: none;">
                      VisionBoard
                    </span>
                  </td>
                  <td align="right">
                    ${
                      workspaceName
                        ? `<span style="display: inline-block; background-color: rgba(255, 255, 255, 0.18); color: #ffffff; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 9999px;">${escapeHtml(
                            workspaceName
                          )}</span>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding: 32px 32px 24px 32px;">
              <!-- Category Badge -->
              <div style="margin-bottom: 16px;">
                <span style="display: inline-block; background-color: ${theme.badgeBg}; color: ${theme.badgeColor}; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
                  ${theme.iconText} ${theme.badge}
                </span>
              </div>

              <!-- Greeting -->
              <p style="font-size: 15px; color: #475569; margin: 0 0 12px 0;">
                ${escapeHtml(recipientGreeting)}
              </p>

              <!-- Notification Title -->
              <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 12px 0; line-height: 1.4;">
                ${escapeHtml(notification.title)}
              </h2>

              <!-- Details Box -->
              <div style="background-color: #f8fafc; border-left: 4px solid ${theme.accentColor}; border-radius: 4px 8px 8px 4px; padding: 16px; margin: 16px 0 24px 0;">
                <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0;">
                  ${escapeHtml(notification.message)}
                </p>
                ${
                  actorLabel
                    ? `<p style="font-size: 12px; color: #64748b; margin: 8px 0 0 0;">${actorLabel}</p>`
                    : ""
                }
              </div>

              <!-- Call to Action Button -->
              <table border="0" cellpadding="0" cellspacing="0" style="margin: 28px 0 16px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #2563eb;">
                    <a href="${fullTargetUrl}" target="_blank" style="display: inline-block; padding: 12px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.01em;">
                      ${theme.actionText} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct Link -->
              <p style="font-size: 12px; color: #94a3b8; margin: 20px 0 0 0; line-height: 1.5; word-break: break-all;">
                Or open this link directly: <br>
                <a href="${fullTargetUrl}" style="color: #2563eb; text-decoration: none;">${escapeHtml(
                  fullTargetUrl
                )}</a>
              </p>
            </td>
          </tr>

          <!-- Footer & Compliance -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; text-align: center;">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 8px 0;">
                You received this email because notification alerts are enabled for your VisionBoard account (${escapeHtml(
                  recipient.email
                )}).
              </p>
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                <a href="${preferencesUrl}" style="color: #2563eb; text-decoration: none; font-weight: 500;">Manage Preferences</a>
                &nbsp;&bull;&nbsp;
                <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe Instantly</a>
              </p>
              <p style="font-size: 11px; color: #cbd5e1; margin: 12px 0 0 0;">
                &copy; 2026 VisionBoard Inc. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

/**
 * Basic HTML escaping helper.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
