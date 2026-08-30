/**
 * lib/auth/safe-compare.ts — Constant-time string comparison.
 *
 * Uses Node's `timingSafeEqual` to prevent timing-based credential extraction.
 * When lengths differ a dummy compare still runs to avoid leaking length info
 * via execution time, even though string length is not secret in our use-cases.
 *
 * Import this wherever secrets are compared (admin password, cron token, etc.)
 * instead of duplicating the implementation per-file.
 */
import { timingSafeEqual } from "crypto";

export function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Run a dummy compare to prevent length-based timing leaks.
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
