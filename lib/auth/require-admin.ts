/**
 * requireAdmin — shared helper for /api/admin/* route handlers.
 *
 * Reads and verifies the admin_session cookie.  Returns null when valid.
 * Returns a ready-to-send 401 NextResponse when the session is missing or invalid.
 *
 * Usage:
 *   const denied = await requireAdmin(request);
 *   if (denied) return denied;
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-session";

export async function requireAdmin(
  request: NextRequest
): Promise<NextResponse | null> {
  const sessionCookie = request.cookies.get("admin_session")?.value;
  const valid = await verifyAdminSession(sessionCookie);
  if (!valid) {
    return NextResponse.json(
      { success: false, message: "Admin authentication required" },
      { status: 401 }
    );
  }
  return null;
}
