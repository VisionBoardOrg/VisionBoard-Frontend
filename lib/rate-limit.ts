import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number;      // Max allowed requests in window
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

/**
 * In-process rate limit store.
 *
 * IMPORTANT: This Map lives in a single Node.js process. In serverless/edge
 * environments (Vercel, AWS Lambda) each invocation may run in a fresh process,
 * so the counter effectively resets on every cold start. This still provides
 * meaningful protection in long-running server deployments (Railway, Fly.io,
 * Docker), but is NOT sufficient for serverless.
 *
 * For serverless production deployments, replace this with an Upstash Redis
 * adapter. Drop-in replacement:
 *
 *   import { Ratelimit } from "@upstash/ratelimit"
 *   import { Redis } from "@upstash/redis"
 *   const ratelimit = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(5, "15 m"),
 *   })
 *   // Then: const { success } = await ratelimit.limit(ip)
 *
 * Required env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */
const memoryStore = new Map<string, RateLimitRecord>();

// Sweep stale entries every 5 minutes to prevent unbounded memory growth
const SWEEP_INTERVAL = 5 * 60 * 1000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function ensureSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryStore.entries()) {
      if (now > record.resetTime) memoryStore.delete(key);
    }
  }, SWEEP_INTERVAL);
  // Allow the process to exit even if the interval is still pending
  if (sweepTimer.unref) sweepTimer.unref();
}

/**
 * Extract the most trustworthy client IP from request headers.
 *
 * Priority order:
 * 1. cf-connecting-ip  — set by Cloudflare, cannot be spoofed on CF-proxied deployments
 * 2. x-real-ip         — set by reverse proxy (nginx, Caddy); single trusted value
 * 3. x-vercel-ip       — set by Vercel edge infrastructure
 * 4. x-forwarded-for   — use the first valid client IP in the chain
 * 5. Fallback "unknown" — all requests share one bucket; still caps total rate
 */
export function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp && isValidIp(cfIp.trim())) return cfIp.trim();

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp && isValidIp(xRealIp.trim())) return xRealIp.trim();

  const xVercelIp = req.headers.get("x-vercel-ip");
  if (xVercelIp && isValidIp(xVercelIp.trim())) return xVercelIp.trim();

  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const parts = xForwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
    const candidate = parts[0];
    if (candidate && isValidIp(candidate)) return candidate;
  }

  return "unknown";
}

/** Minimal IPv4 / IPv6 validator — rejects obviously injected values. */
function isValidIp(ip: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true;
  if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":")) return true;
  return false;
}

/**
 * Check and enforce a rate limit for the given action + client IP.
 *
 * Returns `{ allowed: true }` when under the limit, or
 * `{ allowed: false, response }` with a ready-to-return 429 NextResponse.
 */
export function checkRateLimit(
  req: NextRequest,
  action: string,
  config: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 10 }
): { allowed: boolean; remaining: number; resetSec: number; response?: NextResponse } {
  ensureSweep();

  const ip = getClientIp(req);
  const key = `${action}:${ip}`;
  const now = Date.now();

  let record = memoryStore.get(key);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + config.windowMs };
    memoryStore.set(key, record);
  } else {
    record.count += 1;
  }

  const remaining = Math.max(0, config.max - record.count);
  const resetSec = Math.ceil((record.resetTime - now) / 1000);

  if (record.count > config.max) {
    const response = NextResponse.json(
      {
        success: false,
        message: "Too many requests. Please try again later.",
        error: "RATE_LIMIT_EXCEEDED",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(resetSec),
          "X-RateLimit-Limit": String(config.max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetSec),
        },
      }
    );
    return { allowed: false, remaining: 0, resetSec, response };
  }

  return { allowed: true, remaining, resetSec };
}
