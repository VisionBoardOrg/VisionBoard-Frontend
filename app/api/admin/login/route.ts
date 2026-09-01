import { NextRequest, NextResponse } from "next/server";
import { signAdminSession } from "@/lib/auth/admin-session";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeCompare } from "@/lib/auth/safe-compare";

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "admin-login", {
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
        // Path must be "/" so the cookie is sent to both /admin/* UI routes AND
        // /api/admin/* API routes. Setting path:"/admin" would exclude /api/admin/*
        // because the path prefix "/api/admin" does not start with "/admin".
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
