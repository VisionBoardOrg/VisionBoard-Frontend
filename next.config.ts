import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Security headers applied to every response.
 *
 * CSP notes:
 * - In DEVELOPMENT: 'unsafe-eval' is included because React DevTools and
 *   Next.js hot-reload require it for stack-trace reconstruction and HMR.
 *   This is safe since the dev server is not publicly accessible.
 * - In PRODUCTION: 'unsafe-eval' is removed. Next.js 14+ does not need it.
 * - 'unsafe-inline' is kept for style-src only (Tailwind CSS-in-JS requires it).
 * - frame-ancestors 'none' duplicates X-Frame-Options: DENY for CSP-aware browsers.
 */
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' removed — nonce-based CSP is applied per-request in
      // middleware (proxy.ts) for HTML routes. This fallback header covers
      // non-HTML responses and any routes not matched by middleware.
      // Dev retains 'unsafe-eval' for React DevTools / Next.js HMR.
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // instrumentation.js is enabled by default in Next.js 15+ — no flag needed.
  images: {
    remotePatterns: [
      // Google OAuth avatars
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
