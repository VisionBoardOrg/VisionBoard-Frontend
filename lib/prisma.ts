import { PrismaClient } from "@prisma/client";
import "server-only";

/**
 * lib/prisma.ts — Singleton PrismaClient v5.22 with pool guardrails.
 *
 * ⚠️  Prisma 5.x pool settings live ONLY on the connection URL query string.
 * Constructor-level values (log, datasources.url override) are fine but
 * `connection_limit` / `pool_timeout` / `connect_timeout` / `pgbouncer`
 * are parsed from the URL itself — so we MUST rewrite the URL to guarantee
 * them, regardless of whether the deploy environment has them set.
 *
 * Pool-sizing rationale:
 *   Supabase FREE tier (Nano compute) LOCKS PgBouncer into Session mode
 *   (the Pool Mode dropdown is hidden; Transaction mode requires Pro/Team).
 *   PgBouncer Session-mode pool_size defaults to 15 (editable up to ~20).
 *   In Session mode every open Prisma conn pins 1 PgBouncer slot for its
 *   entire lifetime — so conservative per-process limits are critical.
 *
 *   We set Prisma connection_limit = 5 (prod) / 3 (dev) → headroom of
 *   ~10 reserved across 2 concurrent replicas + migrations + webhooks
 *   + Supabase internal health-check connections.
 *   Under-provisioning the Prisma pool is always safer than the alternative.
 *
 * pool_timeout = 5s (down from Prisma's default 10s):
 *   When the pool is saturated we want to fail FAST and let the caller
 *   fall back to JWT-cached values. A 10s wait just ties up connections
 *   longer and turns a transient spike into a cascading outage.
 *
 * Retry middleware (transient errors only):
 *   On top of the pool sizing, we wrap every query with a jittered
 *   exponential-backoff retry (max 3 attempts) for known-transient
 *   PgBouncer / pool-exhaustion errors. This masks the tail of the
 *   error distribution during cold-start bursts without hiding real
 *   failures.
 */

const PRODUCTION_CONNECTION_LIMIT = 5;
const DEV_CONNECTION_LIMIT        = 3;
const POOL_TIMEOUT_SECONDS        = 5;
const CONNECT_TIMEOUT_SECONDS     = 10;

const MAX_TRANSIENT_RETRIES = 3;
const RETRY_BASE_MS         = 120;

function isTransientPoolError(err: unknown): boolean {
  if (err == null) return false;
  const msg  = typeof (err as { message?: unknown }).message  === "string" ? (err as { message: string }).message  : "";
  const name = typeof (err as { name?: unknown    }).name     === "string" ? (err as { name: string    }).name     : "";
  const haystack = `${name} ${msg}`.toLowerCase();
  return (
    /emaxconnsession|max clients reached|pool_size/i.test(haystack) ||
    /too many connections|too many clients already/i.test(haystack) ||
    /timed out fetching a new connection/i.test(haystack) ||
    /pgbouncer.*(session|server).*unavailable/i.test(haystack) ||
    /prismaclient(unknownrequest|connectionpool)error/.test(haystack) &&
      /(connector|database|pool)/i.test(haystack)
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

const isProd = process.env.NODE_ENV === "production";
const targetLimit = isProd ? PRODUCTION_CONNECTION_LIMIT : DEV_CONNECTION_LIMIT;

function buildPoolSafeUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    // Throw a very specific message so Vercel deploy failures are obvious.
    throw new Error(
      "[prisma] DATABASE_URL is undefined. Cannot build PrismaClient."
    );
  }
  const u = new URL(rawUrl);
  u.searchParams.set("connection_limit", String(targetLimit));
  u.searchParams.set("pool_timeout",     String(POOL_TIMEOUT_SECONDS));
  u.searchParams.set("connect_timeout",  String(CONNECT_TIMEOUT_SECONDS));
  // Supabase pooler URL already has pgbouncer=true — make sure it stays set
  // for any pooled URL. (DIRECT_URL is NEVER passed through this file).
  if (u.hostname.includes("pooler.supabase.com")) {
    u.searchParams.set("pgbouncer", "true");
  }
  return u.toString();
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ["error"] : ["error", "warn"],
    datasources: {
      db: {
        // URL is rewritten above to enforce pool limits regardless of env.
        url: buildPoolSafeUrl(process.env.DATABASE_URL),
      },
    },
  });

// Attach to global immediately so HMR / lambda reuse can never accidentally
// construct a second client with its own independent pool.
globalForPrisma.prisma = prisma;

// ── Retry middleware: transient PgBouncer/pool-exhaustion errors ────────
// Wraps every query/transaction with up to MAX_TRANSIENT_RETRIES retries
// using jittered exponential backoff. Only retries known-transient pool
// errors (e.g. EMAXCONNSESSION digest 669171692) — everything else rethrows
// on the first failure so real bugs are visible.
prisma.$use(async (params, next) => {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await next(params);
    } catch (err) {
      attempt += 1;
      if (attempt > MAX_TRANSIENT_RETRIES || !isTransientPoolError(err)) {
        throw err;
      }
      // Jittered exponential backoff: ~120ms, ~240ms, ~480ms (±25%).
      const backoff =
        RETRY_BASE_MS * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      if (isProd) {
        console.warn(
          `[prisma] transient pool error on ${params.model ?? "?"}.${params.action} ` +
            `(attempt ${attempt}/${MAX_TRANSIENT_RETRIES}); retrying in ${backoff.toFixed(0)}ms — ` +
            (err instanceof Error ? err.message : String(err))
        );
      }
      await sleepMs(backoff);
    }
  }
});

if (!isProd) {
  // Warm the pool lazily. On cold start the first query still works because
  // Prisma lazy-connects — this just moves the latency to module load.
  prisma.$connect().catch((err) => {
    console.warn(
      "[prisma] Initial $connect failed — will lazy-connect on first query.",
      err instanceof Error ? err.message : String(err)
    );
  });
}

// Graceful teardown: give connections back on process exit so the pooler
// doesn't keep them pinned for its own idle-reclaim timeout (~60s). This
// matters a lot during rolling deploys where N old processes exit at once.
if (typeof process !== "undefined" && typeof process.on === "function") {
  const cleanup = () => {
    void prisma.$disconnect().catch(() => {});
  };
  for (const sig of ["beforeExit", "SIGTERM", "SIGINT"] as const) {
    process.once(sig, cleanup);
  }
}
