import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  // SECURITY (HIGH-5): Use the server-configured APP_URL as the redirect base,
  // never request.url's origin. A misconfigured reverse proxy or Host header
  // injection could otherwise redirect users to an attacker-controlled domain.
  const appBase = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  const fallbackRedirect = `${appBase}/dashboard`;

  if (!token) {
    return NextResponse.redirect(`${fallbackRedirect}?verified=error&reason=invalid`);
  }

  try {
    const record = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!record) {
      return NextResponse.redirect(`${fallbackRedirect}?verified=error&reason=invalid`);
    }

    if (record.expires < new Date()) {
      await prisma.verificationToken.delete({ where: { token } });
      return NextResponse.redirect(`${fallbackRedirect}?verified=error&reason=expired`);
    }

    const userId = record.identifier.replace("email-verification:", "");

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.redirect(`${fallbackRedirect}?verified=error&reason=invalid_user`);
    }

    // Set emailVerified timestamp
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });

    // Delete token after successful use
    await prisma.verificationToken.delete({ where: { token } });

    return NextResponse.redirect(`${fallbackRedirect}?verified=true`);
  } catch (error) {
    console.error("[verify-email GET] Error:", error);
    return NextResponse.redirect(`${fallbackRedirect}?verified=error&reason=server_error`);
  }
}
