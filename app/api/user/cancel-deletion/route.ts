import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

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

  if (parsed.success && parsed.data.email) {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, scheduledDeletion: true },
    });

    if (user?.scheduledDeletion) {
      await prisma.user.update({
        where: { id: user.id },
        data: { scheduledDeletion: null },
      });
    }

    // Always return uniform response to prevent email enumeration
    return NextResponse.json({
      success: true,
      message: "If that account was scheduled for deletion, it has been cancelled and reactivated.",
    });
  }

  return NextResponse.json(
    { error: "Invalid request. Please provide an email address or log in to restore your account." },
    { status: 400 }
  );
}
