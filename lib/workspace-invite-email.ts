import { Resend } from "resend";
import nodemailer from "nodemailer";

interface SendWorkspaceInviteEmailArgs {
  email: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}

export interface EmailDispatchResult {
  sent: boolean;
  mode: "resend" | "smtp" | "console";
  message: string;
}

export async function sendWorkspaceInviteEmail({
  email,
  workspaceName,
  inviterName,
  role,
  inviteUrl,
}: SendWorkspaceInviteEmailArgs): Promise<EmailDispatchResult> {
  const roleTitle = role.toUpperCase();
  const subject = `📩 ${inviterName} invited you to join ${workspaceName} on VisionBoard`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>VisionBoard Workspace Invitation</title>
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
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
            padding: 32px;
            text-align: center;
            color: #ffffff;
          }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
          .content { padding: 32px; line-height: 1.6; }
          .invite-card {
            background-color: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 14px;
            padding: 24px;
            text-align: center;
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
            <h2>You've been invited to join ${workspaceName}!</h2>
            <p>
              <strong>${inviterName}</strong> has invited you to collaborate as a <strong>${roleTitle}</strong> on VisionBoard.
            </p>
            <div class="invite-card">
              <p style="margin: 0; font-weight: 600; color: #1e40af;">Click below to accept your invitation and access the workspace:</p>
              <a href="${inviteUrl}" class="cta-button">Accept Invitation & Join Workspace →</a>
            </div>
            <p style="font-size: 12px; color: #64748b;">
              Direct Link: <br />
              <code style="word-break: break-all; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${inviteUrl}</code>
            </p>
          </div>
          <div class="footer">
            &copy; 2026 VisionBoard Inc. If you were not expecting this invite, you can safely ignore this email.
          </div>
        </div>
      </body>
    </html>
  `;

  // 1. Resend Dispatch (Primary)
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
        console.error("[RESEND ERROR]", response.error);
        return {
          sent: false,
          mode: "resend",
          message: `Resend Email Error: ${response.error.message || "Failed to send email via Resend."}`,
        };
      }

      console.log(`[RESEND EMAIL SENT] Real invitation email delivered to ${email} (Resend ID: ${response.data?.id})`);
      return {
        sent: true,
        mode: "resend",
        message: `Invitation email delivered to ${email} via Resend.`,
      };
    } catch (resendErr: any) {
      console.error("[RESEND EXCEPTION] Failed to dispatch via Resend:", resendErr?.message || resendErr);
      return {
        sent: false,
        mode: "resend",
        message: `Resend Exception: ${resendErr?.message || "Failed to send email."}`,
      };
    }
  }

  // 2. SMTP Dispatch (Fallback)
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

      console.log(`[SMTP EMAIL SENT] Real invitation email delivered to ${email} via ${smtpHost}`);
      return {
        sent: true,
        mode: "smtp",
        message: `Invitation email delivered to ${email} via SMTP.`,
      };
    } catch (smtpErr: any) {
      console.error("[SMTP EXCEPTION] Failed to send via SMTP:", smtpErr?.message || smtpErr);
    }
  }

  // 3. Dev Console Dispatch (Fallback)
  console.log(`
========================================================================
[WORKSPACE INVITATION DISPATCH] Dev Console Logger (No Resend / SMTP Configured)
------------------------------------------------------------------------
To: ${email}
Invited By: ${inviterName}
Workspace: ${workspaceName} (Role: ${roleTitle})
Subject: ${subject}
Note: Configure RESEND_API_KEY or SMTP_* env vars to send real emails.
      The invite URL is NOT logged here to avoid token leakage in server logs.
========================================================================
  `);

  return {
    sent: true,
    mode: "console",
    message: `Invitation generated! Configure RESEND_API_KEY in .env to send real inbox emails.`,
  };
}
