/**
 * POST /api/user/cancel-deletion
 *
 * Two paths:
 *
 * 1. Authenticated (session present):
 *    The user is still logged in and clicks "Cancel deletion" from the account
 *    page.  We trust the session and clear scheduledDeletion directly.
 *
 * 2. Token-based (session absent, ?token= query param):
 *    The user has been signed out (sessions are invalidated on deletion
 *    scheduling) and arrives via the link in the confirmation email.
 *    We verify the HMAC-signed, time-limited token from lib/deletion-token.ts.
 *    The token encodes the userId and an expiry — no email address is exposed
 *    in the URL, and only the holder of a valid signed token can cancel.
 *
 * The old path accepted a raw email address with no authentication, which
 * allowed anyone who knew the target's email to prevent them from deleting
 * their account (GDPR right-to-erasure violation).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCancelDeletionToken } from "@/lib/deletion-token";
import { z } from "zod";

const bodySchema = z.object({
  token: z.string().min(1).optional(),
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

  // ── Path 2: signed token from email link ───────────────────────────────────
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (parsed.success && parsed.data.token) {
    const userId = await verifyCancelDeletionToken(parsed.data.token);

    if (userId) {
      // Only cancel if the account is actually scheduled — avoids a write on
      // already-cleared or non-existent accounts.
      await prisma.user.updateMany({
        where: { id: userId, scheduledDeletion: { not: null } },
        data: { scheduledDeletion: null },
      });
    }

    // Always return a uniform success response to prevent user-ID enumeration.
    // (The caller can't distinguish "token valid, deletion cancelled" from
    // "token valid but account wasn't scheduled" — both are benign.)
    return NextResponse.json({
      success: true,
      message:
        "If that account was scheduled for deletion, it has been cancelled and reactivated.",
    });
  }

  return NextResponse.json(
    {
      error:
        "Invalid or expired cancellation link. Please log in to cancel your account deletion, " +
        "or contact support if your link has expired.",
    },
    { status: 400 }
  );
}
