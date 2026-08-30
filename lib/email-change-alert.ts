/**
 * lib/email-change-alert.ts
 *
 * Sends a security alert to a user's *previous* email address whenever
 * their account email is changed.  If the change was not authorised, this
 * gives the real owner a window to contact support before the account is
 * fully transferred.
 *
 * Degrades gracefully to a console log when RESEND_API_KEY is not set.
 */

import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "VisionBoard <onboarding@resend.dev>";

interface EmailChangeAlertArgs {
  oldEmail: string;
  newEmail: string;
  name?: string | null;
}

export async function sendEmailChangeAlertEmail({
  oldEmail,
  newEmail,
  name,
}: EmailChangeAlertArgs): Promise<void> {
  const displayName = name || oldEmail.split("@")[0];
  const supportEmail = "support@vision-board.tech";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; color: #0f172a;">
  <div style="max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07);">
    <div style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); padding: 28px 32px; text-align: center;">
      <h1 style="margin: 0; color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -0.025em;">Security Alert — VisionBoard</h1>
    </div>
    <div style="padding: 32px; line-height: 1.6;">
      <p>Hi ${displayName},</p>
      <p>The email address on your VisionBoard account was just changed.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <tr>
          <td style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600; width: 40%;">Previous email</td>
          <td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${oldEmail}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 600;">New email</td>
          <td style="padding: 10px 14px; border: 1px solid #e2e8f0;">${newEmail}</td>
        </tr>
      </table>
      <p><strong>If you made this change</strong>, no action is needed. A verification email has been sent to your new address.</p>
      <p><strong>If you did NOT make this change</strong>, your account may be compromised. Please contact support immediately:</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="mailto:${supportEmail}?subject=Unauthorised email change on my account"
           style="display: inline-block; background: #dc2626; color: #fff; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; text-decoration: none;">
          Contact Support →
        </a>
      </div>
      <p style="font-size: 13px; color: #64748b;">
        This alert was sent to your previous email address (${oldEmail}) as a security measure.
      </p>
    </div>
    <div style="background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      &copy; 2026 VisionBoard Inc. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email-change-alert] RESEND_API_KEY not set — would send security alert to ${oldEmail} ` +
      `notifying of email change to ${newEmail}`
    );
    return;
  }

  const resend = new Resend(apiKey);
  try {
    await resend.emails.send({
      from: FROM,
      to: oldEmail,
      subject: "⚠️ Security alert: your VisionBoard email address was changed",
      html,
    });
  } catch (err) {
    // Log but don't throw — a failed alert email must never block the profile update
    console.error("[email-change-alert] Failed to send security alert:", err);
  }
}
