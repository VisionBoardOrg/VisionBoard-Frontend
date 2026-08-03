import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  // Minimum 12 characters with at least one non-alphabetic character
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(100)
    .refine(
      (p) => /[^a-zA-Z]/.test(p),
      "Password must contain at least one number or symbol"
    ),
  // Optional invite token — required when the app is in waitlist-only mode
  inviteToken: z.string().optional(),
});

/**
 * Returns true when the app is operating in waitlist-only mode.
 * Set WAITLIST_MODE=true in your environment to require an invite token
 * for all new registrations.
 */
function isWaitlistMode(): boolean {
  return process.env.WAITLIST_MODE === "true";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { name, email, password, inviteToken } = parsed.data;

    // ── Invite token enforcement ──────────────────────────────────────────
    if (isWaitlistMode()) {
      if (!inviteToken) {
        return NextResponse.json(
          { error: "An invite token is required to register." },
          { status: 403 }
        );
      }

      // Validate and atomically consume the token in a transaction so two
      // concurrent requests cannot both succeed with the same token.
      const consumed = await prisma.$transaction(async (tx) => {
        const entry = await tx.waitlistEntry.findUnique({
          where: { inviteToken },
        });

        if (!entry) return null;
        if (entry.status !== "INVITED") return null;
        // Prevent token reuse: mark as registered immediately
        return tx.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: "REGISTERED" },
        });
      });

      if (!consumed) {
        return NextResponse.json(
          { error: "Invalid or already-used invite token." },
          { status: 403 }
        );
      }
    }
    // ──────────────────────────────────────────────────────────────────────

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { name, email, hashedPassword },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
