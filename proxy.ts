import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import { auth } from "@/lib/auth";

// Routes that require user authentication
const PROTECTED_PREFIXES = ["/dashboard", "/workspace", "/onboarding"];
// Routes that authenticated users should not see
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Admin Page Protection
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = request.cookies.get("admin_session")?.value;
    if (!(await verifyAdminSession(session))) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  // 2. Admin API Protection
  if (pathname.startsWith("/api/admin") && pathname !== "/api/admin/login") {
    const session = request.cookies.get("admin_session")?.value;
    if (!(await verifyAdminSession(session))) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 401 }
      );
    }
  }

  // 3. User Authentication for Protected & Auth Routes
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (isProtected || isAuthRoute) {
    const session = await auth();

    if (isProtected && !session) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (isAuthRoute && session) {
      const dest = session.user.workspaceId
        ? `/workspace/${session.user.workspaceId}/board`
        : "/onboarding";
      return NextResponse.redirect(new URL(dest, request.url));
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
