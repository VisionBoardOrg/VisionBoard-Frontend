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
 *   Supabase PgBouncer session-mode hard cap = 15 (EMAXCONNSESSION error
 *   in the prod logs confirms this is what the project is configured with).
 *   We set Prisma connection_limit = 10 → headroom of 5 reserved for:
 *     - migrations (prisma deploy uses DIRECT_URL non-pooled)
 *     - Stripe webhook handlers running concurrently (long-lived txns)
 *     - A 2nd Vercel lambda replica warming up at the same time
 *     - Supabase internal health-check connections
 *   Under-provisioning the Prisma pool is always safer than the alternative.
 *
 * pool_timeout = 5s (down from Prisma's default 10s):
 *   When the pool is saturated we want to fail FAST and let the caller
 *   fall back to JWT-cached values. A 10s wait just ties up connections
 *   longer and turns a transient spike into a cascading outage.
 */

const PRODUCTION_CONNECTION_LIMIT = 10;
const DEV_CONNECTION_LIMIT        = 5;
const POOL_TIMEOUT_SECONDS        = 5;
const CONNECT_TIMEOUT_SECONDS     = 10;

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
