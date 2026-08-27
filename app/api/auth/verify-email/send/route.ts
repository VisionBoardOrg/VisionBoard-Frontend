import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email-verification";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 3 resend attempts per 15 minutes per IP
  const rateLimit = checkRateLimit(request, "resend-verification", {
    windowMs: 15 * 60 * 1000,
    max: 3,
  });
  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // OAuth users (Google, etc.) are implicitly verified by their identity provider
    const oauthAccount = await prisma.account.findFirst({
      where: { userId: user.id },
    });

    if (oauthAccount && !user.emailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
      return NextResponse.json(
        { message: "Your email address is verified via OAuth." },
        { status: 200 }
      );
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { message: "Your email address is already verified." },
        { status: 200 }
      );
    }

    const { origin } = new URL(request.url);
    const result = await sendVerificationEmail({
      userId: user.id,
      email: user.email,
      name: user.name,
      origin,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      mode: result.mode,
    });
  } catch (error) {
    console.error("[verify-email/send POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to send verification email. Please try again later." },
      { status: 500 }
    );
  }
}
