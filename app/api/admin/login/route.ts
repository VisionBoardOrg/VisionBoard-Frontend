import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { signAdminSession } from "@/lib/auth/admin-session";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Constant-time string comparison — prevents timing attacks on credential checks.
 * Returns false immediately if lengths differ (length itself is not secret here,
 * but we pad to avoid short-circuit on the underlying buffer compare).
 */
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Still run a dummy compare to avoid length-based timing leak
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, "admin-login", {
    windowMs: 15 * 60 * 1000,
    max: 5,
  });

  if (!rateLimit.allowed && rateLimit.response) {
    return rateLimit.response;
  }

  try {
    const { username, password } = await request.json();

    const expectedUsername = process.env.ADMIN_USERNAME || "admin";
    const expectedPassword = process.env.ADMIN_PASSWORD;

    if (!expectedPassword) {
      console.error("[admin/login] ADMIN_PASSWORD env var is not set.");
      return NextResponse.json(
        { success: false, message: "Server configuration error" },
        { status: 500 }
      );
    }

    if (
      username &&
      password &&
      safeCompare(String(username).trim(), expectedUsername) &&
      safeCompare(String(password), expectedPassword)
    ) {
      const response = NextResponse.json({
        success: true,
        message: "Authentication successful",
      });

      // Store a cryptographically signed token, NOT the raw secret
      const sessionToken = await signAdminSession();

      response.cookies.set("admin_session", sessionToken, {
        httpOnly: true,
        // Always require HTTPS — do not rely solely on NODE_ENV to detect secure context.
        // In local HTTP dev you can override this via ADMIN_COOKIE_INSECURE=true.
        secure: process.env.ADMIN_COOKIE_INSECURE !== "true",
        sameSite: "strict",
        maxAge: 60 * 60 * 24, // 1 day session
        path: "/",
      });

      return response;
    }

    return NextResponse.json(
      { success: false, message: "Invalid username or password" },
      { status: 401 }
    );
  } catch (error: unknown) {
    console.error("[admin/login]", error);
    return NextResponse.json(
      { success: false, message: "Authentication failed" },
      { status: 500 }
    );
  }
}
