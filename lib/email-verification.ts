import { Resend } from "resend";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

interface SendVerificationEmailArgs {
  userId: string;
  email: string;
  name?: string | null;
  origin?: string;
}

export interface EmailDispatchResult {
  sent: boolean;
  mode: "resend" | "smtp" | "console";
  message: string;
}

export async function sendVerificationEmail({
  userId,
  email,
  name,
  origin,
}: SendVerificationEmailArgs): Promise<EmailDispatchResult> {
  const baseUrl =
    origin ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  // Clean up any existing verification tokens for this user
  await prisma.verificationToken.deleteMany({
    where: { identifier: `email-verification:${userId}` },
  });

  // Generate crypto token valid for 24 hours
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: `email-verification:${userId}`,
      token,
      expires,
    },
  });

  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
  const userName = name || email.split("@")[0];
  const subject = "✉️ Verify your VisionBoard email address";

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify your email — VisionBoard</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 560px;
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
          .verify-card {
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
            padding: 13px 30px;
            border-radius: 10px;
            margin-top: 12px;
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
            <h2>Welcome to VisionBoard, ${userName}!</h2>
            <p>
              Please verify your email address to secure your account and unlock full access to workspace features. This link will expire in <strong>24 hours</strong>.
            </p>
            <div class="verify-card">
              <a href="${verifyUrl}" class="cta-button">Verify Email Address →</a>
            </div>
            <p style="font-size: 12px; color: #64748b; word-break: break-all;">
              Or copy and paste this link into your browser:<br />
              <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${verifyUrl}</code>
            </p>
          </div>
          <div class="footer">
            &copy; 2026 VisionBoard Inc. If you did not create an account, you can safely ignore this email.
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
        console.error("[VERIFICATION RESEND ERROR]", response.error);
        return {
          sent: false,
          mode: "resend",
          message: `Resend Error: ${response.error.message || "Failed to send email via Resend."}`,
        };
      }

      console.log(`[VERIFICATION EMAIL SENT] Verification email sent to ${email} (Resend ID: ${response.data?.id})`);
      return {
        sent: true,
        mode: "resend",
        message: `Verification email delivered to ${email} via Resend.`,
      };
    } catch (resendErr: unknown) {
      const errorMessage = resendErr instanceof Error ? resendErr.message : String(resendErr);
      console.error("[VERIFICATION RESEND EXCEPTION]", errorMessage);
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

      console.log(`[VERIFICATION SMTP SENT] Email delivered to ${email} via ${smtpHost}`);
      return {
        sent: true,
        mode: "smtp",
        message: `Verification email delivered to ${email} via SMTP.`,
      };
    } catch (smtpErr: unknown) {
      const errorMessage = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      console.error("[VERIFICATION SMTP EXCEPTION]", errorMessage);
    }
  }

  // 3. Dev Console Dispatch (Fallback)
  console.log(`
========================================================================
[EMAIL VERIFICATION DISPATCH] Dev Console Logger (No Resend / SMTP Configured)
------------------------------------------------------------------------
To: ${email}
User ID: ${userId}
Verification URL: ${verifyUrl}
Expires: ${expires.toISOString()}
Note: Configure RESEND_API_KEY in .env to send real emails to inbox.
========================================================================
  `);

  return {
    sent: true,
    mode: "console",
    message: `Verification link generated! Open link from dev console to test verification.`,
  };
}
