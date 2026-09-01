import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // Must delete with path:"/" matching the path the cookie was set on.
  response.cookies.set("admin_session", "", {
    httpOnly: true,
    secure: process.env.ADMIN_COOKIE_INSECURE !== "true",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  return response;
}
