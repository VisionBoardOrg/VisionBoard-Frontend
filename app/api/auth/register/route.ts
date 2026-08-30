import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

import { sendVerificationEmail } from "@/lib/email-verification";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  // Minimum 12 characters with at least one non-alphabetic character
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(100)
    .refine(
      (p) => /[^a-zA-Z]/.test(p),
      "Password must contain at least one number or symbol"
    ),
});

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

    const { name, email, password } = parsed.data;

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

    // Send verification email in background
    const { origin } = new URL(request.url);
    sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
      origin,
    }).catch((err) => console.error("[register] Failed to dispatch verification email:", err));

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error("[register]", err);
    return NextResponse.json({ error: "Registration failed." }, { status: 500 });
  }
}
