import { NextRequest, NextResponse } from "next/server";
import { signAdminSession } from "@/lib/auth/admin-session";
import { checkRateLimit } from "@/lib/rate-limit";

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
      username.trim() === expectedUsername &&
      password === expectedPassword
    ) {
      const response = NextResponse.json({
        success: true,
        message: "Authentication successful",
      });

      // Store a cryptographically signed token, NOT the raw secret
      const sessionToken = await signAdminSession();

      response.cookies.set("admin_session", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
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
    const message = error instanceof Error ? error.message : "Authentication failed";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
