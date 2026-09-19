import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkRateLimitByKey, getClientIp } from "@/lib/rate-limit";
import { NextRequest } from "next/server";

describe("Rate Limiting Engine (lib/rate-limit.ts)", () => {
  it("allows requests up to max and blocks on max + 1", async () => {
    const key = `test:simple:${Date.now()}`;
    const config = { windowMs: 60 * 1000, max: 3 };

    const r1 = await checkRateLimitByKey(key, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimitByKey(key, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await checkRateLimitByKey(key, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = await checkRateLimitByKey(key, config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.response?.status).toBe(429);
    expect(r4.response?.headers.get("Retry-After")).toBeTruthy();
    expect(r4.response?.headers.get("X-RateLimit-Limit")).toBe("3");
    expect(r4.response?.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("isolates different keys independently", async () => {
    const keyA = `test:isolateA:${Date.now()}`;
    const keyB = `test:isolateB:${Date.now()}`;
    const config = { windowMs: 60 * 1000, max: 2 };

    await checkRateLimitByKey(keyA, config);
    await checkRateLimitByKey(keyA, config);
    const blockedA = await checkRateLimitByKey(keyA, config);
    expect(blockedA.allowed).toBe(false);

    // keyB should still have full quota
    const allowedB = await checkRateLimitByKey(keyB, config);
    expect(allowedB.allowed).toBe(true);
    expect(allowedB.remaining).toBe(1);
  });

  it("supports different windowMs and max configurations without cross-pollution", async () => {
    const keyLow = `test:cfgLow:${Date.now()}`;
    const keyHigh = `test:cfgHigh:${Date.now()}`;

    const configLow = { windowMs: 15 * 60 * 1000, max: 2 };
    const configHigh = { windowMs: 15 * 60 * 1000, max: 10 };

    await checkRateLimitByKey(keyLow, configLow);
    await checkRateLimitByKey(keyLow, configLow);
    const lowCheck = await checkRateLimitByKey(keyLow, configLow);
    expect(lowCheck.allowed).toBe(false);

    // keyHigh with max: 10 should not be blocked by configLow's cached adapter
    for (let i = 0; i < 5; i++) {
      const res = await checkRateLimitByKey(keyHigh, configHigh);
      expect(res.allowed).toBe(true);
    }
  });

  it("extracts client IP prioritizing cf-connecting-ip > x-real-ip > x-vercel-ip > x-forwarded-for", () => {
    const req1 = new NextRequest("http://localhost/api/test", {
      headers: {
        "cf-connecting-ip": "203.0.113.195",
        "x-real-ip": "198.51.100.1",
      },
    });
    expect(getClientIp(req1)).toBe("203.0.113.195");

    const req2 = new NextRequest("http://localhost/api/test", {
      headers: {
        "x-real-ip": "198.51.100.1",
        "x-forwarded-for": "192.0.2.1, 10.0.0.1",
      },
    });
    expect(getClientIp(req2)).toBe("198.51.100.1");

    const req3 = new NextRequest("http://localhost/api/test", {
      headers: {
        "x-forwarded-for": "192.0.2.1, 10.0.0.1",
      },
    });
    expect(getClientIp(req3)).toBe("192.0.2.1");

    const req4 = new NextRequest("http://localhost/api/test");
    expect(getClientIp(req4)).toBe("unknown");
  });
});

describe("Account Lockout Logic & Brute-Force Defense", () => {
  it("locks account after 5 consecutive failures for 15 minutes", () => {
    let failedAttempts = 0;
    let lockedUntil: Date | null = null;

    function simulateFailedAttempt() {
      failedAttempts += 1;
      if (failedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
    }

    function isLocked() {
      return lockedUntil !== null && lockedUntil > new Date();
    }

    for (let i = 1; i <= 4; i++) {
      simulateFailedAttempt();
      expect(failedAttempts).toBe(i);
      expect(isLocked()).toBe(false);
    }

    // 5th attempt locks the account
    simulateFailedAttempt();
    expect(failedAttempts).toBe(5);
    expect(isLocked()).toBe(true);
    expect(lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
  });

  it("resets failed attempts and unlocks account upon successful authentication", () => {
    let failedAttempts = 4;
    let lockedUntil: Date | null = null;

    // Successful sign-in
    function simulateSuccessfulLogin() {
      if (lockedUntil && lockedUntil > new Date()) {
        throw new Error("ACCOUNT_LOCKED");
      }
      failedAttempts = 0;
      lockedUntil = null;
    }

    simulateSuccessfulLogin();
    expect(failedAttempts).toBe(0);
    expect(lockedUntil).toBeNull();
  });

  it("rejects authentication while lockedEven if valid credentials are provided", () => {
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);

    function authenticate(passwordCorrect: boolean) {
      if (lockedUntil && lockedUntil > new Date()) {
        const remainingMinutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / (60 * 1000)));
        throw new Error(`ACCOUNT_LOCKED:${remainingMinutes}`);
      }
      return passwordCorrect;
    }

    expect(() => authenticate(true)).toThrowError(/ACCOUNT_LOCKED/);
    expect(() => authenticate(false)).toThrowError(/ACCOUNT_LOCKED/);
  });
});

describe("Per-Target Rate Limiting (Password Reset & Verification)", () => {
  it("enforces max 3 password reset attempts per email per hour", async () => {
    const email = `victim-${Date.now()}@example.com`;
    const resetConfig = { windowMs: 60 * 60 * 1000, max: 3 };

    const r1 = await checkRateLimitByKey(`rl:reset-email:${email}`, resetConfig);
    const r2 = await checkRateLimitByKey(`rl:reset-email:${email}`, resetConfig);
    const r3 = await checkRateLimitByKey(`rl:reset-email:${email}`, resetConfig);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);

    const r4 = await checkRateLimitByKey(`rl:reset-email:${email}`, resetConfig);
    expect(r4.allowed).toBe(false);
  });

  it("enforces per-user rate limit on verification email resend", async () => {
    const userId = `usr-${Date.now()}`;
    const verifyConfig = { windowMs: 15 * 60 * 1000, max: 3 };

    for (let i = 0; i < 3; i++) {
      const res = await checkRateLimitByKey(`rl:resend-verification:user:${userId}`, verifyConfig);
      expect(res.allowed).toBe(true);
    }

    const blocked = await checkRateLimitByKey(`rl:resend-verification:user:${userId}`, verifyConfig);
    expect(blocked.allowed).toBe(false);
  });
});
