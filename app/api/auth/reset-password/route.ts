import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Resend } from "resend";
import { checkRateLimit } from "@/lib/rate-limit";

const requestSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(100)
    .refine(
      (p) => /[^a-zA-Z]/.test(p),
      "Password must contain at least one number or symbol"
    ),
});

// POST /api/auth/reset-password — request a reset link
// POST /api/auth/reset-password?action=reset — consume token & set new password
export async function POST(request: NextRequest) {
  // Rate limit both actions — 5 attempts per 15 minutes per IP
  const rateLimit = checkRateLimit(request, "password-reset", {
    windowMs: 15 * 60 * 1000,
    max: 5,
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "reset") {
    // ── Step 2: consume token & update password ──
    const body = await request.json();
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { token, password } = parsed.data;

    // Look up the verification token
    const record = await prisma.verificationToken.findUnique({ where: { token } });
    if (!record) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }

    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
    }

    // identifier is "password-reset:<email>"
    const email = record.identifier.replace("password-reset:", "");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { email }, data: { hashedPassword } });
    await prisma.verificationToken.delete({ where: { token } });

    // Invalidate all existing sessions so the attacker cannot retain access
    // after a victim changes their password.
    await prisma.session.deleteMany({ where: { userId: user.id } });

    return NextResponse.json({ success: true, message: "Password updated successfully." });
  }

  // ── Step 1: request reset link ──
  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  const { email } = parsed.data;

  // Always return 200 to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ success: true, message: "If that email exists, a reset link has been sent." });
  }

  // OAuth-only users have no password to reset
  if (!user.hashedPassword) {
    return NextResponse.json({ success: true, message: "If that email exists, a reset link has been sent." });
  }

  // Delete any existing reset token for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier: `password-reset:${email}` },
  });

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.verificationToken.create({
    data: {
      identifier: `password-reset:${email}`,
      token,
      expires,
    },
  });

  const origin = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${origin}/reset-password?token=${token}`;

  // Send email
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "VisionBoard <onboarding@resend.dev>";

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><title>Reset your VisionBoard password</title></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8faff; margin: 0; padding: 0;">
        <div style="max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07);">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 28px 32px; text-align: center;">
            <h1 style="margin: 0; color: #fff; font-size: 22px; font-weight: 800;">VisionBoard</h1>
          </div>
          <div style="padding: 32px;">
            <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Reset your password</h2>
            <p style="color: #475569; line-height: 1.6;">We received a request to reset the password for your VisionBoard account. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 13px 30px; border-radius: 10px;">Reset Password →</a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
            <p style="color: #94a3b8; font-size: 12px; word-break: break-all;">Or copy this link: ${resetUrl}</p>
          </div>
        </div>
      </body>
    </html>
  `;

  if (resendApiKey?.trim()) {
    try {
      const resend = new Resend(resendApiKey.trim());
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: "Reset your VisionBoard password",
        html,
      });
    } catch (err) {
      console.error("[reset-password] Resend error:", err);
    }
  } else {
    // In development without Resend configured, log only that a reset was
    // triggered — never log the token or full URL (they appear in server logs).
    console.log(`[DEV] Password reset requested for ${email}. Configure RESEND_API_KEY to send real emails.`);
  }

  return NextResponse.json({ success: true, message: "If that email exists, a reset link has been sent." });
}
