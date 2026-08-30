import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // SECURITY (LOW-1): Must delete with the same path the cookie was set on.
  response.cookies.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.ADMIN_COOKIE_INSECURE !== "true",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });

  return response;
}
