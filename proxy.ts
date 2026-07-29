import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin paths (excluding the login page itself)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = request.cookies.get("admin_session")?.value;

    if (!(await verifyAdminSession(session))) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  // Protect /api/admin paths (excluding the login API endpoint)
  if (pathname.startsWith("/api/admin") && pathname !== "/api/admin/login") {
    const session = request.cookies.get("admin_session")?.value;

    if (!(await verifyAdminSession(session))) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 401 }
      );
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
