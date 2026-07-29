import { NextRequest, NextResponse } from "next/server";

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number;      // Max allowed requests in window
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitRecord>();

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of memoryStore.entries()) {
    if (now > record.resetTime) {
      memoryStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Extract client IP address from request headers with standard proxy header support.
 */
export function getClientIp(req: NextRequest): string {
  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIp = req.headers.get("x-real-ip");
  if (xRealIp) {
    return xRealIp.trim();
  }

  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  return "127.0.0.1";
}

/**
 * Enforce rate limit on an API route.
 * Returns null if allowed, or a 429 NextResponse if rate limit is exceeded.
 */
export function checkRateLimit(
  req: NextRequest,
  action: string,
  config: RateLimitConfig = { windowMs: 15 * 60 * 1000, max: 10 }
): { allowed: boolean; remaining: number; resetSec: number; response?: NextResponse } {
  const ip = getClientIp(req);
  const key = `${action}:${ip}`;
  const now = Date.now();

  let record = memoryStore.get(key);

  if (!record || now > record.resetTime) {
    record = {
      count: 1,
      resetTime: now + config.windowMs,
    };
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
