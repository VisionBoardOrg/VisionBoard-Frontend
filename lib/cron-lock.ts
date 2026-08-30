/**
 * lib/cron-lock.ts — Distributed cron lock to prevent parallel run double-fire.
 *
 * Problem: Vercel Cron (and most distributed schedulers) can occasionally fire
 * duplicate triggers within milliseconds of each other.  Two parallel sweeps
 * runs will both query the same overdue tasks, both pass the in-memory
 * deduplication check (separate processes, separate Sets), and both dispatch
 * notifications — users receive duplicates.
 *
 * Solution: An advisory lock stored in Redis (or an in-process Map for
 * single-instance deployments).  The first run acquires the lock; any
 * subsequent run that starts while the lock is held immediately returns
 * { acquired: false } and should skip all processing.
 *
 * Lock design:
 *   - Key:    "cronlock:<lockName>"
 *   - Value:  ISO timestamp of acquisition (for debugging)
 *   - TTL:    TTL_MS (default 5 min) — auto-released even if the holder crashes
 *   - SET NX: only the first caller succeeds; subsequent callers get null back
 *
 * Redis path: uses Upstash REST client when UPSTASH_REDIS_REST_URL is set.
 * Fallback:   in-process Map — safe for Railway/Fly.io single replica; NOT safe
 *             for multi-instance serverless (same caveat as the rate-limiter).
 *             A console.warn is emitted in production to make this visible.
 */

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── In-process fallback ────────────────────────────────────────────────────

const memoryLocks = new Map<string, number>(); // key → expiry timestamp

function acquireInMemory(key: string, ttlMs: number): boolean {
  const now = Date.now();
  const expiry = memoryLocks.get(key);
  if (expiry !== undefined && now < expiry) return false; // lock held
  memoryLocks.set(key, now + ttlMs);
  return true;
}

function releaseInMemory(key: string): void {
  memoryLocks.delete(key);
}

// ── Redis adapter ──────────────────────────────────────────────────────────

type RedisLockAdapter = {
  acquire: (key: string, ttlMs: number) => Promise<boolean>;
  release: (key: string) => Promise<void>;
};

let _adapter: RedisLockAdapter | null | "init" = "init";

async function getAdapter(): Promise<RedisLockAdapter | null> {
  if (_adapter !== "init") return _adapter;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[cron-lock] UPSTASH_REDIS_REST_URL not set — falling back to in-process lock. " +
        "On multi-instance/serverless deployments parallel cron triggers will NOT be " +
        "deduplicated across instances.  Set Upstash credentials to enforce the lock fleet-wide."
      );
    }
    _adapter = null;
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });

    _adapter = {
      acquire: async (key: string, ttlMs: number): Promise<boolean> => {
        // SET NX PX: only sets if the key does not exist; returns "OK" or null
        const result = await redis.set(key, new Date().toISOString(), {
          nx: true,
          px: ttlMs,
        });
        return result === "OK";
      },
      release: async (key: string): Promise<void> => {
        await redis.del(key).catch(() => {}); // best-effort early release
      },
    };
  } catch (err) {
    console.warn("[cron-lock] Failed to initialise Upstash adapter:", err);
    _adapter = null;
  }

  return _adapter;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CronLock {
  /** Release the lock early (before TTL expires).  Call in a finally block. */
  release: () => Promise<void>;
}

/**
 * Attempt to acquire a named cron lock.
 *
 * Returns `{ acquired: true, lock }` if this caller now holds the lock.
 * Returns `{ acquired: false }` if another instance is already running.
 *
 * Always call `lock.release()` in a finally block after the cron work
 * completes so the TTL slot is freed for the next scheduled run:
 *
 * ```ts
 * const { acquired, lock } = await acquireCronLock("sweeps");
 * if (!acquired) return NextResponse.json({ skipped: "parallel run in progress" });
 * try {
 *   // ... do work ...
 * } finally {
 *   await lock!.release();
 * }
 * ```
 */
export async function acquireCronLock(
  lockName: string,
  ttlMs = DEFAULT_TTL_MS
): Promise<{ acquired: true; lock: CronLock } | { acquired: false; lock?: undefined }> {
  const key     = `cronlock:${lockName}`;
  const adapter = await getAdapter();

  if (adapter) {
    const ok = await adapter.acquire(key, ttlMs);
    if (!ok) return { acquired: false };
    return {
      acquired: true,
      lock: { release: () => adapter.release(key) },
    };
  }

  // In-process fallback
  const ok = acquireInMemory(key, ttlMs);
  if (!ok) return { acquired: false };
  return {
    acquired: true,
    lock: {
      release: async () => releaseInMemory(key),
    },
  };
}
