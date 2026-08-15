/**
 * POST /api/user/delete
 *
 * Schedules the authenticated user's account for deletion.
 * Per the Privacy Policy, data is retained in read-only mode for 30 days
 * then permanently deleted. This endpoint sets `scheduledDeletion` to
 * now + 30 days and signs the user out.
 *
 * A nightly cron job (or Vercel Cron) should call a cleanup route that
 * permanently deletes users whose `scheduledDeletion` date has passed.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { sendAccountDeletionNoticeEmail } from "@/lib/account-deletion-email";

const bodySchema = z.object({
  /** Users must type their email address to confirm deletion */
  confirmEmail: z.string().email(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please provide your email address to confirm." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, scheduledDeletion: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Validate the confirmation email matches
  if (parsed.data.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Email address does not match. Please enter your exact account email." },
      { status: 400 },
    );
  }

  if (user.scheduledDeletion) {
    return NextResponse.json({
      success: true,
      message: "Your account is already scheduled for deletion.",
      scheduledDeletion: user.scheduledDeletion.toISOString(),
    });
  }

  const scheduledDeletion = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.user.update({
    where: { id: user.id },
    data: { scheduledDeletion },
  });

  // Send deletion notice email with cancellation CTA link
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const cancelUrl = `${baseUrl}/auth/cancel-deletion?email=${encodeURIComponent(user.email)}`;

  sendAccountDeletionNoticeEmail({
    email: user.email,
    scheduledDeletionDate: scheduledDeletion,
    cancelUrl,
  }).catch((err) => console.error("[delete route] Deletion email failed:", err));

  // Invalidate all sessions so the user is signed out immediately
  await prisma.session.deleteMany({ where: { userId: user.id } });

  return NextResponse.json({
    success: true,
    message:
      "Your account has been scheduled for deletion. A confirmation email with a cancellation link has been sent. Your data will be permanently deleted in 30 days. You have been signed out.",
    scheduledDeletion: scheduledDeletion.toISOString(),
  });
}
