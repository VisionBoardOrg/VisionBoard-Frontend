/**
 * POST /api/user/cancel-deletion
 *
 * Three paths:
 *
 * 1. Authenticated (session present):
 *    The user is still logged in and clicks "Cancel deletion" from the account
 *    page. We trust the session and clear scheduledDeletion directly.
 *
 * 2. Token-based (session absent, { token }):
 *    The user has been signed out (sessions are invalidated on deletion
 *    scheduling) and arrives via the link in the confirmation email.
 *    We verify the HMAC-signed, time-limited token from lib/deletion-token.ts.
 *
 * 3. Resend restoration link ({ action: "resend", email }):
 *    Rate-limited flow for users redirected from sign-in or with an expired
 *    email link. Sends a fresh signed HMAC restoration link if the email
 *    belongs to an account with a pending deletion, while always returning a
 *    generic success message to prevent account enumeration.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  signCancelDeletionToken,
  verifyCancelDeletionToken,
} from "@/lib/deletion-token";
import { sendAccountDeletionNoticeEmail } from "@/lib/account-deletion-email";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const tokenSchema = z.object({
  token: z.string().min(1),
});

const resendSchema = z.object({
  action: z.literal("resend"),
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(255)),
});

export async function POST(request: NextRequest) {
  // ── Path 1: authenticated session ─────────────────────────────────────────
  const session = await auth();
  if (session?.user?.id) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { scheduledDeletion: null },
    });
    return NextResponse.json({
      success: true,
      message: "Account deletion cancelled successfully. Your account has been reactivated.",
    });
  }

  const body = await request.json().catch(() => ({}));

  // ── Path 2: resend signed restoration link ────────────────────────────────
  const parsedResend = resendSchema.safeParse(body);
  if (parsedResend.success) {
    const rl = await checkRateLimit(request, "cancel-deletion-resend", {
      windowMs: 15 * 60 * 1000,
      max: 5,
    });
    if (!rl.allowed && rl.response) {
      return rl.response;
    }

    const { email } = parsedResend.data;
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, name: true, scheduledDeletion: true },
      });

      if (user && user.scheduledDeletion) {
        const token = await signCancelDeletionToken(user.id);
        const origin = new URL(request.url).origin;
        const cancelUrl = `${origin}/auth/cancel-deletion?token=${encodeURIComponent(token)}`;
        await sendAccountDeletionNoticeEmail({
          email: user.email,
          name: user.name,
          scheduledDeletionDate: user.scheduledDeletion,
          cancelUrl,
        });
      }
    } catch (err) {
      console.error("[POST /api/user/cancel-deletion] Resend failed:", err);
    }

    return NextResponse.json({
      success: true,
      resent: true,
      message:
        "If an account with that email is scheduled for deletion, we've sent a secure restoration link to your inbox.",
    });
  }

  // ── Path 3: signed token from email link ──────────────────────────────────
  const parsedToken = tokenSchema.safeParse(body);
  if (parsedToken.success) {
    const userId = await verifyCancelDeletionToken(parsedToken.data.token);

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "This restoration link is invalid or has expired. Enter your email below to request a new restoration link.",
        },
        { status: 400 }
      );
    }

    // Only cancel if the account is actually scheduled — avoids a write on
    // already-cleared or non-existent accounts.
    await prisma.user.updateMany({
      where: { id: userId, scheduledDeletion: { not: null } },
      data: { scheduledDeletion: null },
    });

    // Uniform success response prevents user-ID enumeration.
    return NextResponse.json({
      success: true,
      message:
        "If that account was scheduled for deletion, it has been cancelled and reactivated.",
    });
  }

  return NextResponse.json(
    {
      error:
        "Invalid or expired cancellation link. Enter your email below to receive a fresh restoration link.",
    },
    { status: 400 }
  );
}
