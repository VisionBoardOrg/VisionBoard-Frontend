/**
 * lib/csp.ts — Single source of truth for the Content-Security-Policy header.
 *
 * ── script-src strategy ─────────────────────────────────────────────────────
 * Next.js App Router injects several inline <script> tags (for __NEXT_DATA__,
 * RSC payloads, and chunk manifests) that have no nonce in the static-headers
 * deployment path (next.config.ts headers()). Without a per-request nonce
 * threaded through middleware → layout → every <Script> component, those tags
 * are blocked by any policy that omits 'unsafe-inline'.
 *
 * Wiring a runtime nonce is a significant structural change (middleware must
 * generate the nonce, pass it via a response header, and every layout must
 * read it from headers()). Until that work is done, 'unsafe-inline' is kept in
 * script-src. This is the same posture as Next.js's own documentation recommends
 * for static-header deployments.
 *
 * 'unsafe-inline' is NOT a regression vs. the previous state of the codebase —
 * it was present before the audit. The meaningful XSS mitigations in place are:
 *   • sanitize-html allowlist on every comment body before DB storage
 *   • Tiptap node/mark/attr allowlist on every document save
 *   • Zod input validation on all API routes
 *   • HttpOnly session cookies (JS cannot read them even if XSS fires)
 *
 * ── frame-src ────────────────────────────────────────────────────────────────
 * 'none' must be the ONLY token in a directive — combining it with URLs causes
 * browsers to ignore 'none' entirely. Since Stripe requires two iframes, the
 * directive lists those two origins with no 'none' keyword.
 *
 * ── Other rules ──────────────────────────────────────────────────────────────
 *   - 'unsafe-eval' is only included in development (React DevTools / HMR).
 *   - 'unsafe-inline' is kept for style-src (Tailwind CSS-in-JS).
 *   - Stripe connect-src: https://api.stripe.com
 *   - frame-ancestors 'none' doubles X-Frame-Options: DENY for CSP-aware browsers.
 */
export function buildCsp(
  isDev = process.env.NODE_ENV !== "production",
  nonce?: string
): string {
  // Include nonce when provided by middleware; otherwise omit it.
  // 'unsafe-inline' is required for Next.js inline scripts in the static path.
  const nonceDirective = nonce ? `'nonce-${nonce}'` : "";
  const scriptSrc = [
    "'self'",
    nonceDirective,
    "'unsafe-inline'",
    isDev ? "'unsafe-eval'" : "",
    "https://js.stripe.com",
    "https://static.cloudflareinsights.com",
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // 'unsafe-inline' is required for Tailwind / CSS-in-JS at the style level.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    // https://api.stripe.com is required for Stripe.js XHR calls.
    "connect-src 'self' https: wss: https://cloudflareinsights.com https://api.stripe.com",
    // FIXED: 'none' must not appear alongside other origins — it is ignored by
    // browsers when combined. List only the two required Stripe iframe origins.
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
