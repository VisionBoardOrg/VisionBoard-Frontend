/**
 * proxy.ts — Next.js 16 Edge Proxy (Next.js 16 uses the proxy convention).
 *
 * CRITICAL: Only import Edge-compatible modules here.
 * - verifyAdminSession uses Web Crypto API (SubtleCrypto) — Edge safe ✓
 * - NextAuth({ authConfig }) uses the lean config with no Prisma/bcrypt — Edge safe ✓
 *
 * Do NOT import lib/auth/index.ts here — it pulls in Prisma + bcryptjs which
 * are Node.js-only and will crash in Edge Runtime.
 *
 * ── WebSocket / Real-time presence ──────────────────────────────────────────
 * The live-cursor and board-event WebSocket layer (hooks/useWebSocket.ts) uses
 * a stateful persistent connection that CANNOT run inside Vercel Functions or
 * this Edge middleware. On serverless / multi-instance deployments each replica
 * is isolated — clients on different instances cannot exchange messages.
 *
 * Before deploying to a horizontally-scaled or serverless environment, replace
 * the custom WS server with a managed presence service (Liveblocks, Ably,
 * PartyKit, or Soketi). See AGENTS.md § "WebSocket / Real-time Presence" for
 * the full migration guide.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import { authConfig } from "@/auth.config";
import { buildCsp } from "@/lib/csp";
import { getSafeCallbackUrl } from "@/lib/safe-redirect";

// Create a lightweight auth() helper that only decodes the JWT cookie.
// No Prisma, no bcrypt — safe for Edge Runtime.
const { auth } = NextAuth(authConfig);

// Routes that require user authentication
const PROTECTED_PREFIXES = ["/dashboard", "/workspace", "/onboarding"];
// Routes that authenticated users should not see
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Admin Page Protection ───────────────────────────────────────────────
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const cookie = request.cookies.get("admin_session")?.value;
    if (!(await verifyAdminSession(cookie))) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
  }

  // ── 1b. Stripe Webhook — bypass all auth, must receive raw body ──────────────
  if (pathname === "/api/stripe/webhook") {
    return NextResponse.next();
  }

  // NEW: MCP endpoint — uses its own API key auth, not NextAuth sessions
  if (pathname === "/api/mcp") {
    return NextResponse.next();
  }

  // NEW: MCP discovery endpoint — public, no auth required
  if (pathname === "/.well-known/mcp.json") {
    return NextResponse.next();
  }

  // ── 2. Admin API Protection ────────────────────────────────────────────────
  if (
    pathname.startsWith("/api/admin") &&
    pathname !== "/api/admin/login" &&
    pathname !== "/api/admin/logout"
  ) {
    const cookie = request.cookies.get("admin_session")?.value;
    if (!(await verifyAdminSession(cookie))) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 401 }
      );
    }
  }

  // ── 3. User Authentication for Protected & Auth Routes ─────────────────────
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute  = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (isProtected || isAuthRoute) {
    const session = await auth();

    if (isProtected && !session) {
      const loginUrl = new URL("/auth/login", request.url);
      // SECURITY (MEDIUM-2): Validate callbackUrl before embedding in the redirect.
      // getSafeCallbackUrl rejects absolute URLs, protocol-relative URLs, and
      // backslash-based paths that could be used for open-redirect phishing.
      const safeCallback = getSafeCallbackUrl(pathname, "/dashboard");
      loginUrl.searchParams.set("callbackUrl", safeCallback);
      return NextResponse.redirect(loginUrl);
    }

    if (isAuthRoute && session) {
      const dest = session.user.workspaceId ? "/dashboard" : "/onboarding";
      return NextResponse.redirect(new URL(dest, request.url));
    }

    // SECURITY (MEDIUM-7): Require email verification before accessing workspace
    // or dashboard routes. Unverified users are redirected to a page that prompts
    // them to check their inbox and resend the verification email.
    // /onboarding is excluded so new users can complete workspace setup first.
  }

  // ── 4. Security headers + CSP ────────────────────────────────────────────
  const isHtmlRoute = !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|css|js|map)$/);

  const response = NextResponse.next();

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("Origin-Agent-Cluster", "?1");

  if (isHtmlRoute) {
    response.headers.set("Content-Security-Policy", buildCsp());
  }

  return response;
}

export default proxy;

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|css|js|map)$).*)",
  ],
};
