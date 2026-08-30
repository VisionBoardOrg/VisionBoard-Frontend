import type { NextConfig } from "next";
import { buildCsp } from "./lib/csp";

/**
 * Security headers applied to every response via Next.js static headers config.
 *
 * The CSP value is produced by lib/csp.ts — the single source of truth shared
 * with proxy.ts (Edge middleware).  Do not inline CSP directives here.
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
    // No nonce in static headers — 'strict-dynamic' allows Next.js chunk loading.
    value: buildCsp(),
  },
];

const nextConfig: NextConfig = {
  // Explicitly enable gzip/brotli compression — important when not behind a CDN
  compress: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@tiptap/react", "@tiptap/starter-kit"],
  },
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
