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
 * Rate-limit backend — chosen at startup based on env vars.
 *
 * PRODUCTION (serverless / multi-instance):
 *   Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 *   Uses Upstash Redis sliding-window so every instance shares the same
 *   counter across the entire Vercel fleet.
 *
 * DEVELOPMENT / single-instance servers (Railway, Fly.io, Docker):
 *   Falls back to the in-process Map. Perfectly adequate for single-process
 *   deployments; gives a clear console warning when Redis is not configured
 *   so it is never silently bypassed in production by accident.
 *
 * Drop-in upgrade path:
 *   npm install @upstash/ratelimit @upstash/redis
 *   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env.
 *   This file handles the rest automatically.
 */

// ── In-process fallback ────────────────────────────────────────────────────

const memoryStore = new Map<string, RateLimitRecord>();

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
  if (sweepTimer.unref) sweepTimer.unref();
}

function checkInMemory(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetSec: number } {
  ensureSweep();
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
  return { allowed: record.count <= config.max, remaining, resetSec };
}

// ── Redis adapter (Upstash) ────────────────────────────────────────────────

type RedisRatelimitAdapter = {
  limit: (key: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

let _redisAdapter: RedisRatelimitAdapter | null | "init" = "init";

async function getRedisAdapter(
  windowMs: number,
  max: number
): Promise<RedisRatelimitAdapter | null> {
  if (_redisAdapter !== "init") return _redisAdapter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set. " +
          "Falling back to in-process store — rate limits ARE BYPASSABLE across serverless instances. " +
          "Set Upstash credentials to enforce limits across the entire fleet."
      );
    }
    _redisAdapter = null;
    return null;
  }

  try {
    // Dynamic import so the package is optional — the app still works without it.
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import("@upstash/ratelimit"),
      import("@upstash/redis"),
    ]);

    const redis = new Redis({ url, token });
    const windowSeconds = Math.ceil(windowMs / 1000);

    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSeconds} s`),
      analytics: false,
    });

    _redisAdapter = {
      limit: async (key: string) => {
        const result = await ratelimit.limit(key);
        return {
          success: result.success,
          remaining: result.remaining,
          reset: result.reset,
        };
      },
    };
  } catch (err) {
    console.warn("[rate-limit] Failed to initialise Upstash adapter:", err);
    _redisAdapter = null;
  }

  return _redisAdapter;
}

// ── IP extraction ──────────────────────────────────────────────────────────

/** Minimal IPv4 / IPv6 validator — rejects obviously injected values. */
function isValidIp(ip: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return true;
  if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":")) return true;
  return false;
}

/**
 * Extract the most trustworthy client IP from request headers.
 *
 * Priority:
 * 1. cf-connecting-ip  — Cloudflare, cannot be spoofed on CF-proxied deployments
 * 2. x-real-ip         — set by nginx / Caddy reverse proxy
 * 3. x-vercel-ip       — set by Vercel edge infrastructure
 * 4. x-forwarded-for   — first valid IP in the chain
 * 5. "unknown"         — all requests share one bucket; still caps total rate
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

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check and enforce a rate limit for the given action + client IP.
 *
 * Returns `{ allowed: true }` when under the limit, or
 * `{ allowed: false, response }` with a ready-to-return 429 NextResponse.
 *
 * Uses Upstash Redis sliding window when credentials are present (safe for
 * serverless/multi-instance), otherwise falls back to the in-process Map.
 */
export async function checkRateLimit(
  req: NextRequest,
  action: string,
  config: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 10 }
): Promise<{ allowed: boolean; remaining: number; resetSec: number; response?: NextResponse }> {
  const ip = getClientIp(req);
  const key = `rl:${action}:${ip}`;

  // Try Redis adapter first
  const adapter = await getRedisAdapter(config.windowMs, config.max);

  if (adapter) {
    const result = await adapter.limit(key);
    const resetSec = Math.ceil((result.reset - Date.now()) / 1000);

    if (!result.success) {
      return {
        allowed: false,
        remaining: 0,
        resetSec,
        response: NextResponse.json(
          { success: false, message: "Too many requests. Please try again later.", error: "RATE_LIMIT_EXCEEDED" },
          {
            status: 429,
            headers: {
              "Retry-After": String(resetSec),
              "X-RateLimit-Limit": String(config.max),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(resetSec),
            },
          }
        ),
      };
    }

    return { allowed: true, remaining: result.remaining, resetSec };
  }

  // In-process fallback
  const { allowed, remaining, resetSec } = checkInMemory(key, config);

  if (!allowed) {
    return {
      allowed: false,
      remaining: 0,
      resetSec,
      response: NextResponse.json(
        { success: false, message: "Too many requests. Please try again later.", error: "RATE_LIMIT_EXCEEDED" },
        {
          status: 429,
          headers: {
            "Retry-After": String(resetSec),
            "X-RateLimit-Limit": String(config.max),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(resetSec),
          },
        }
      ),
    };
  }

  return { allowed: true, remaining, resetSec };
}
