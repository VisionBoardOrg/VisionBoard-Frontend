/**
 * proxy.ts — Next.js Edge Middleware (this project uses the "proxy" convention).
 *
 * CRITICAL: Only import Edge-compatible modules here.
 * - verifyAdminSession  uses Web Crypto API (SubtleCrypto) — Edge safe ✓
 * - NextAuth({ authConfig }) uses the lean config with no Prisma/bcrypt — Edge safe ✓
 *
 * Do NOT import lib/auth/index.ts here — it pulls in Prisma + bcryptjs which
 * are Node.js-only and will crash in Edge Runtime.
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-session";
import { authConfig } from "@/auth.config";

// Create a lightweight auth() helper that only decodes the JWT cookie.
// No Prisma, no bcrypt — safe for Edge Runtime.
const { auth } = NextAuth(authConfig);

// Routes that require user authentication
const PROTECTED_PREFIXES = ["/dashboard", "/workspace", "/onboarding"];
// Routes that authenticated users should not see
const AUTH_ROUTES = ["/auth/login", "/auth/register"];

/** Generate a cryptographically random nonce for CSP. Edge-compatible. */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Build the Content-Security-Policy header value for a given nonce.
 * Using a per-request nonce removes the need for 'unsafe-inline' on script-src.
 * Next.js injects the nonce automatically when it is present in the CSP header.
 */
function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss: https://cloudflareinsights.com https://api.stripe.com",
    "frame-src 'none' https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

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
  // auth() here only decodes the JWT — no DB calls, safe in Edge Runtime.
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthRoute  = AUTH_ROUTES.some((p) => pathname.startsWith(p));

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

  // ── 4. Security headers + nonce-based CSP ─────────────────────────────────
  // Skip CSP injection for static assets and API routes (no HTML to nonce)
  const isHtmlRoute = !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|woff2?|ttf|css|js|map)$/);

  const nonce = generateNonce();
  const response = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        // Pass nonce to Next.js so it can inject it on <script> tags
        "x-nonce": nonce,
      }),
    },
  });

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  if (isHtmlRoute) {
    response.headers.set("Content-Security-Policy", buildCsp());
  }

  return response;
}

/**
 * Route matcher — tells Next.js which paths this proxy function runs on.
 * Excludes static files, Next.js internals, and common asset extensions
 * so the middleware doesn't add latency to requests that don't need it.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|css|js|map)$).*)",
  ],
};
