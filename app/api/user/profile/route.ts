/**
 * PATCH /api/user/profile
 *
 * Allows authenticated users to update their own name, email, and profile
 * image URL.
 *
 * Email change security requirements:
 *   1. Current password must be confirmed (prevents session-hijack account
 *      takeover — an attacker with an unlocked session cannot silently redirect
 *      the account to an address they control).
 *   2. `emailVerified` is reset to null on the new address — the user must
 *      re-verify before email-gated features are available again.
 *   3. A security alert is sent to the OLD address so the real owner is
 *      notified and can contact support if the change was unauthorised.
 *   4. A verification email is dispatched to the NEW address.
 *
 * OAuth-only accounts (no hashedPassword) may not change their email via this
 * endpoint — their email is managed by the OAuth provider.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/email-verification";
import { sendEmailChangeAlertEmail } from "@/lib/email-change-alert";

const patchSchema = z.object({
  name:            z.string().min(1).max(100).trim().optional(),
  email:           z.string().trim().toLowerCase().pipe(z.string().email().max(255)).optional(),
  image:           z.string().url().max(500).nullable().optional(),
  currentPassword: z.string().min(1).optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { name, email, image, currentPassword } = parsed.data;

  if (name === undefined && email === undefined && image === undefined) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // ── Email change path — extra security checks ────────────────────────────
  if (email !== undefined) {
    // Fetch current user to compare email and verify password
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, hashedPassword: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Block OAuth-only users from changing email here — their email is
    // managed by the OAuth provider (Google, GitHub, etc.).
    if (!currentUser.hashedPassword) {
      return NextResponse.json(
        { error: "Your email address is managed by your OAuth provider and cannot be changed here." },
        { status: 400 }
      );
    }

    // Require current password confirmation to prevent session-hijack takeover.
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Current password is required to change your email address." },
        { status: 400 }
      );
    }

    const passwordValid = await bcrypt.compare(currentPassword, currentUser.hashedPassword);
    if (!passwordValid) {
      return NextResponse.json(
        { error: "Incorrect password. Please re-enter your current password to change your email." },
        { status: 403 }
      );
    }

    // Reject if the new address is already in use by another account.
    if (email !== currentUser.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== session.user.id) {
        return NextResponse.json(
          { error: "That email address is already associated with another account." },
          { status: 409 }
        );
      }

      const oldEmail = currentUser.email;

      // Perform the update, clearing emailVerified so the new address must be
      // confirmed before email-gated features become available again.
      const updated = await prisma.user.update({
        where: { id: session.user.id },
        data: {
          email,
          emailVerified: null,
          // Apply any co-submitted name/image changes in the same write.
          ...(name  !== undefined ? { name }  : {}),
          ...(image !== undefined ? { image } : {}),
        },
        select: { id: true, name: true, email: true, image: true },
      });

      // Fire-and-forget: alert old address + send verification to new address.
      // Neither failure should block the response — the DB update already succeeded.
      const origin = new URL(request.url).origin;
      Promise.all([
        sendEmailChangeAlertEmail({ oldEmail, newEmail: email, name: updated.name }),
        sendVerificationEmail({ userId: session.user.id, email, name: updated.name, origin }),
      ]).catch((err) =>
        console.error("[profile PATCH] Post-email-change email dispatch failed:", err)
      );

      return NextResponse.json({ user: updated, emailVerificationSent: true });
    }
    // If email === currentUser.email, it's a no-op change — fall through to
    // the generic update below (name/image may still need updating).
  }

  // ── Generic update (name / image only, or same-email re-submit) ─────────
  const updateData: Record<string, unknown> = {};
  if (name  !== undefined) updateData.name  = name;
  if (image !== undefined) updateData.image = image;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
    select: { id: true, name: true, email: true, image: true },
  });

  return NextResponse.json({ user: updated });
}
