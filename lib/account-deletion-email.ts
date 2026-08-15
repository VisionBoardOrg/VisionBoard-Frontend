import { Resend } from "resend";
import nodemailer from "nodemailer";

interface SendDeletionEmailArgs {
  email: string;
  name?: string | null;
  scheduledDeletionDate: Date;
  cancelUrl: string;
}

export interface EmailDispatchResult {
  sent: boolean;
  mode: "resend" | "smtp" | "console";
  message: string;
}

/**
 * Sends an email notification when account deletion is first scheduled (30-day notice).
 */
export async function sendAccountDeletionNoticeEmail({
  email,
  name,
  scheduledDeletionDate,
  cancelUrl,
}: SendDeletionEmailArgs): Promise<EmailDispatchResult> {
  const formattedDate = scheduledDeletionDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const userName = name || email.split("@")[0];
  const subject = "⚠️ VisionBoard Account Scheduled for Deletion";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Account Scheduled for Deletion</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            border: 1px solid #e2e8f0;
          }
          .header {
            background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%);
            padding: 32px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
          .content { padding: 32px; line-height: 1.6; }
          .warning-card {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 14px;
            padding: 24px;
            margin: 24px 0;
          }
          .cta-button {
            display: inline-block;
            background-color: #2563eb;
            color: #ffffff;
            text-decoration: none;
            font-weight: 700;
            font-size: 15px;
            padding: 12px 28px;
            border-radius: 10px;
            margin-top: 16px;
          }
          .footer {
            background-color: #f8fafc;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>VisionBoard</h1>
          </div>
          <div class="content">
            <h2>Account Deletion Requested</h2>
            <p>Hi ${userName},</p>
            <p>We received a request to delete your VisionBoard account.</p>
            
            <div class="warning-card">
              <p style="margin: 0; font-weight: 700; color: #991b1b;">
                Scheduled Permanent Deletion Date: ${formattedDate}
              </p>
              <p style="margin-top: 8px; font-size: 14px; color: #7f1d1d;">
                After this date, your account, owned workspaces, goals, tasks, documents, and all associated data will be permanently deleted and cannot be recovered.
              </p>
            </div>

            <p><strong>Changed your mind?</strong> You can cancel this request at any time during the 30-day grace period:</p>
            
            <div style="text-align: center; margin: 28px 0;">
              <a href="${cancelUrl}" class="cta-button">Cancel Account Deletion & Keep My Data →</a>
            </div>

            <p style="font-size: 12px; color: #64748b;">
              Direct Link: <br />
              <code style="word-break: break-all; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${cancelUrl}</code>
            </p>
          </div>
          <div class="footer">
            &copy; 2026 VisionBoard Inc. If you did not request account deletion, please click the link above immediately to secure your account.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmailInternal(email, subject, html);
}

/**
 * Sends a 7-day final warning email before permanent deletion.
 */
export async function sendFinalDeletionWarningEmail({
  email,
  name,
  scheduledDeletionDate,
  cancelUrl,
}: SendDeletionEmailArgs): Promise<EmailDispatchResult> {
  const formattedDate = scheduledDeletionDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const userName = name || email.split("@")[0];
  const subject = "🚨 FINAL WARNING: VisionBoard Account Deletion in 7 Days";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Final Warning: Account Deletion</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            border: 1px solid #e2e8f0;
          }
          .header {
            background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%);
            padding: 32px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
          .content { padding: 32px; line-height: 1.6; }
          .warning-card {
            background-color: #fef2f2;
            border: 2px solid #ef4444;
            border-radius: 14px;
            padding: 24px;
            margin: 24px 0;
          }
          .cta-button {
            display: inline-block;
            background-color: #2563eb;
            color: #ffffff;
            text-decoration: none;
            font-weight: 700;
            font-size: 15px;
            padding: 12px 28px;
            border-radius: 10px;
            margin-top: 16px;
          }
          .footer {
            background-color: #f8fafc;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>VisionBoard</h1>
          </div>
          <div class="content">
            <h2>Final Warning: 7 Days Until Permanent Data Loss</h2>
            <p>Hi ${userName},</p>
            <p>This is a final reminder that your VisionBoard account is scheduled for permanent deletion on <strong>${formattedDate}</strong>.</p>
            
            <div class="warning-card">
              <p style="margin: 0; font-weight: 700; color: #991b1b;">
                ⚠️ All your data will be permanently wiped in 7 days!
              </p>
              <p style="margin-top: 8px; font-size: 14px; color: #7f1d1d;">
                This includes all workspaces you own, goals, milestones, sprint tasks, board items, comments, and uploaded documents.
              </p>
            </div>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${cancelUrl}" class="cta-button">Cancel Deletion & Save Account Now →</a>
            </div>

            <p style="font-size: 12px; color: #64748b;">
              Direct Link: <br />
              <code style="word-break: break-all; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${cancelUrl}</code>
            </p>
          </div>
          <div class="footer">
            &copy; 2026 VisionBoard Inc.
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmailInternal(email, subject, html);
}

async function sendEmailInternal(
  email: string,
  subject: string,
  html: string
): Promise<EmailDispatchResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "VisionBoard <onboarding@resend.dev>";

  if (resendApiKey && resendApiKey.trim()) {
    try {
      const resend = new Resend(resendApiKey.trim());
      const response = await resend.emails.send({
        from: fromEmail,
        to: email,
        subject,
        html,
      });

      if (response.error) {
        console.error("[DELETION EMAIL ERROR]", response.error);
        return {
          sent: false,
          mode: "resend",
          message: `Resend Error: ${response.error.message}`,
        };
      }

      console.log(`[DELETION EMAIL SENT] Delivered to ${email} (ID: ${response.data?.id})`);
      return {
        sent: true,
        mode: "resend",
        message: `Deletion notice delivered to ${email} via Resend.`,
      };
    } catch (resendErr: any) {
      console.error("[DELETION EMAIL EXCEPTION]", resendErr);
    }
  }

  // SMTP Fallback
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: fromEmail,
        to: email,
        subject,
        html,
      });

      console.log(`[SMTP DELETION EMAIL SENT] Delivered to ${email}`);
      return {
        sent: true,
        mode: "smtp",
        message: `Deletion notice delivered to ${email} via SMTP.`,
      };
    } catch (smtpErr: any) {
      console.error("[SMTP DELETION EMAIL EXCEPTION]", smtpErr);
    }
  }

  // Dev Console Fallback
  console.log(`
========================================================================
[ACCOUNT DELETION EMAIL DISPATCH] Dev Console Logger
------------------------------------------------------------------------
To: ${email}
Subject: ${subject}
========================================================================
  `);

  return {
    sent: true,
    mode: "console",
    message: `Deletion email logged to console (No RESEND_API_KEY or SMTP configured).`,
  };
}
