/**
 * lib/csp.ts — Single source of truth for the Content-Security-Policy header.
 *
 * Previously the CSP was duplicated between `next.config.ts` (static headers)
 * and `proxy.ts` (Edge middleware). The two copies had already drifted:
 *   • next.config.ts was missing `https://api.stripe.com` in connect-src
 *   • next.config.ts had `frame-src 'none'` instead of the Stripe iframe allowlist
 *
 * Both consumers now import `buildCsp()` from here so any future change is
 * made in one place and takes effect everywhere.
 *
 * Rules:
 *   - 'unsafe-eval' is only included in development (React DevTools / HMR).
 *   - 'unsafe-inline' is kept for style-src only (Tailwind CSS-in-JS).
 *   - Stripe requires:
 *       connect-src  → https://api.stripe.com
 *       frame-src    → https://js.stripe.com  https://hooks.stripe.com
 *   - frame-ancestors 'none' doubles X-Frame-Options: DENY for CSP-aware browsers.
 */
export function buildCsp(isDev = process.env.NODE_ENV !== "production"): string {
  return [
    "default-src 'self'",
    // unsafe-eval only in development (React DevTools / HMR require it).
    // Next.js 14+ does not need it in production.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    // https://api.stripe.com is required for Stripe.js XHR calls.
    "connect-src 'self' https: wss: https://cloudflareinsights.com https://api.stripe.com",
    // js.stripe.com hosts the Stripe payment iframe; hooks.stripe.com handles
    // 3DS authentication redirects.
    "frame-src 'none' https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
