/**
 * lib/auth/index.ts — Full NextAuth configuration for Node.js contexts.
 *
 * This file imports Prisma, bcryptjs, and the PrismaAdapter.
 * It must NEVER be imported from proxy.ts (middleware/Edge Runtime).
 * Middleware uses the lean auth.config.ts instead.
 *
 * ⚠️  DEPENDENCY RISK — next-auth v5 beta
 * The project currently uses next-auth@5.0.0-beta.32, which is a pre-release.
 * Beta packages may contain unresolved CVEs or breaking API changes.
 * Action items:
 *   1. Monitor https://github.com/nextauthjs/next-auth/releases for stable v5.
 *   2. Run `npm audit` regularly to catch any published vulnerabilities.
 *   3. Migrate to the stable release as soon as it is available.
 *   4. Do NOT upgrade using `^` ranges until stable — pin to a known-good beta.
 */

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { cache } from "react";
import type {
  User as PrismaUser,
  WorkspaceMember,
  Workspace,
} from "@prisma/client";

import { checkRateLimitByKey, getClientIp } from "@/lib/rate-limit";

/* ─── Cross-request auth-lookup cache + in-flight deduplication ──────────
 *
 * A single Next.js server (or Vercel lambda warm container) serves many
 * concurrent requests. Without these maps, the following amplification
 * happens at the 5-minute JWT-refresh cadence:
 *
 *   1 user opens 3 tabs → 3 concurrent auth() calls → 3× identical
 *   workspaceMember.findFirst + 3× user.findUnique → 6 connections held
 *
 *   100 concurrent users, all hitting their 5-min refresh within the same
 *   2-second window (because they all signed in during the same deploy
 *   spike) → 600 concurrent DB queries → saturates Supabase pooler which
 *   only allows 15 session-mode connections → EMAXCONNSESSION cascade.
 *
 * Strategy (2 layers):
 *   INFLIGHT  Map<key, Promise<T>>    — same-key concurrent calls all await
 *                                       the same underlying Promise.
 *   RESULT    Map<key, {v, ts}>       — short 15s TTL memo so repeat reads
 *                                       within the same lambda container
 *                                       never go to the DB at all.
 *
 * These caches are per-process (per-lambda). They are intentionally NOT
 * shared across replicas — that is the job of a real Redis layer. For
 * now they eliminate the 95th-percentile fan-out within a single replica,
 * which is already enough to avoid saturation.
 * ─────────────────────────────────────────────────────────────────────── */

const CACHE_TTL_MS = 15 * 1000;
type WorkspaceMemberWithWorkspace = WorkspaceMember & {
  workspace: Workspace;
};
type JwtUserShape = Pick<
  PrismaUser,
  "plan" | "scheduledDeletion" | "emailVerified" | "hashedPassword"
> & {
  accounts: { provider: string }[];
};

type MembershipEntry = { v: WorkspaceMemberWithWorkspace | null; ts: number };
type UserEntry       = { v: JwtUserShape | null;              ts: number };

const globalForAuthCache = globalThis as unknown as {
  authInflightMembership?: Map<string, Promise<WorkspaceMemberWithWorkspace | null>>;
  authCacheMembership?:    Map<string, MembershipEntry>;
  authInflightUser?:       Map<string, Promise<JwtUserShape | null>>;
  authCacheUser?:          Map<string, UserEntry>;
  authBackoffUntil?:       Map<string, number>;
};

const inflightMembership =
  (globalForAuthCache.authInflightMembership ??= new Map());
const cacheMembership =
  (globalForAuthCache.authCacheMembership    ??= new Map());
const inflightUser =
  (globalForAuthCache.authInflightUser       ??= new Map());
const cacheUser =
  (globalForAuthCache.authCacheUser          ??= new Map());
const backoffUntil =
  (globalForAuthCache.authBackoffUntil       ??= new Map());

function getCached<T>(
  map: Map<string, { v: T; ts: number }>,
  key: string,
  now: number
): T | undefined {
  const entry = map.get(key);
  if (entry && now - entry.ts < CACHE_TTL_MS) return entry.v;
  if (entry) map.delete(key);
  return undefined;
}

function setCached<T>(
  map: Map<string, { v: T; ts: number }>,
  key: string,
  value: T,
  now: number
): void {
  map.set(key, { v: value, ts: now });
  // Eviction cap — 500 entries per-process is way more than enough for a
  // warm lambda and keeps memory growth bounded.
  if (map.size > 500) {
    // Drop oldest half — simple O(n) once per 500 inserts, negligible.
    const cutoff = now - CACHE_TTL_MS;
    for (const [k, e] of Array.from(map.entries())) {
      if (e.ts < cutoff) map.delete(k);
    }
    while (map.size > 400) {
      const firstKey = map.keys().next().value;
      if (firstKey === undefined) break;
      map.delete(firstKey);
    }
  }
}

/**
 * Run a factory through the in-flight dedup + short-TTL result cache layers.
 */
async function dedupe<T>(
  key: string,
  inflight: Map<string, Promise<T>>,
  resultCache: Map<string, { v: T; ts: number }>,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = getCached(resultCache, key, now);
  if (cached !== undefined) return cached as T;

  const existing = inflight.get(key);
  if (existing) {
    try {
      const value = await existing;
      setCached(resultCache, key, value, Date.now());
      return value;
    } catch {
      // original threw — fall through to make a fresh attempt
    }
  }

  const promise = factory();
  inflight.set(key, promise);
  try {
    const value = await promise;
    setCached(resultCache, key, value, Date.now());
    return value;
  } finally {
    // Remove inflight ONLY if it's still our promise (not replaced by a
    // later call for the same key during the await window).
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}

function isDbUnavailable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const text = `${(err as { name?: string }).name ?? ""} ${
    (err as { message?: string }).message ?? ""
  }`;
  return /PrismaClient(Initialization|Runtime|KnownRequest|Ratelimit)Error|Can't reach database server|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|pooler\.supabase\.com|connection timeout|SSL connection has been closed|the database system is starting up|too many connections|pgbouncer|connection refused|DNS lookup|max clients reached|EMAXCONNSESSION|Timed out fetching a new connection/.test(
    text
  );
}

/**
 * Exponential backoff after DB failures so we don't retry-storm the pooler.
 * First failure → skip refreshes for 10s (+ jitter).
 * Second  → 30s.
 * Third+  → 2 min. (max).
 * Resets to 0 after a successful refresh.
 */
function markBackoff(userId: string) {
  const key = `u:${userId}`;
  const existing = backoffUntil.get(key) ?? 0;
  const lastFailWindow = Math.max(0, Math.floor((existing - Date.now()) / 1000));
  let nextSec: number;
  if (lastFailWindow <= 10) nextSec = 10;
  else if (lastFailWindow <= 30) nextSec = 30;
  else nextSec = 120;
  // +0–50% jitter so all backed-off users don't resume simultaneously
  const jitterMs = Math.floor(Math.random() * nextSec * 500);
  backoffUntil.set(key, Date.now() + nextSec * 1000 + jitterMs);
}
function clearBackoff(userId: string) {
  backoffUntil.delete(`u:${userId}`);
}
function isInBackoff(userId: string): boolean {
  const until = backoffUntil.get(`u:${userId}`);
  if (!until) return false;
  if (Date.now() > until) {
    backoffUntil.delete(`u:${userId}`);
    return false;
  }
  return true;
}

/**
 * Deduplicated workspace-membership lookup.
 *   React.cache  → dedupes WITHIN one request (layout + page + generateMetadata)
 *   dedupe()     → dedupes ACROSS requests (same-user concurrent tabs,
 *                  same deploy-spike 5-minute refresh wave)
 */
const getWorkspaceMembership = cache(async (userId: string) => {
  return dedupe(
    `m:${userId}`,
    inflightMembership,
    cacheMembership,
    async (): Promise<WorkspaceMemberWithWorkspace | null> => {
      try {
        return await prisma.workspaceMember.findFirst({
          where: { userId },
          include: { workspace: true },
          orderBy: { joinedAt: "asc" },
        });
      } catch (err) {
        if (isDbUnavailable(err)) {
          console.warn(
            "[auth] getWorkspaceMembership DB unreachable — falling back to cached JWT values.",
            (err as { message?: string }).message
          );
          return null;
        }
        throw err;
      }
    }
  );
});

const getJwtUserShape = cache(async (userId: string) => {
  return dedupe(
    `u:${userId}`,
    inflightUser,
    cacheUser,
    async (): Promise<JwtUserShape | null> => {
      return prisma.user
        .findUnique({
          where: { id: userId },
          select: {
            plan: true,
            scheduledDeletion: true,
            emailVerified: true,
            hashedPassword: true,
            accounts: { select: { provider: true }, take: 1 },
          },
        })
        .catch((err) => {
          if (isDbUnavailable(err)) return null;
          throw err;
        });
    }
  );
});

/**
 * Wrap every method on the PrismaAdapter with DB-unreachable soft-failure.
 * NextAuth calls adapter methods directly (e.g. during auth() resolution) even
 * in JWT mode; transient pooler/DNS failures must not crash the entire RSC tree.
 */
function withDbFallback<T extends object>(adapter: T): T {
  const wrapped = {} as T;
  const source = adapter as Record<string, unknown>;
  const target = wrapped as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const original = source[key];
    if (typeof original === "function") {
      target[key] = async function (
        this: unknown,
        ...args: unknown[]
      ): Promise<unknown> {
        try {
          return await (
            original as (...a: unknown[]) => Promise<unknown>
          ).apply(this, args);
        } catch (err) {
          if (isDbUnavailable(err)) {
            console.warn(
              `[auth] PrismaAdapter.${key} DB unreachable — returning undefined.`,
              (err as { message?: string }).message
            );
            return undefined;
          }
          throw err;
        }
      };
    } else {
      target[key] = original;
    }
  }
  return wrapped;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email()),
  password: z.string().min(12),
});

// Constant-time bcrypt dummy hash for user-does-not-exist mitigation.
const TIMING_SAFE_DUMMY_HASH =
  "$2b$12$e8Ym4B3lK1QkU5D3yU2v6eN4Ew6E1HjVvQhK.Y1M3GqO4Z8.F1B2C";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: withDbFallback(PrismaAdapter(prisma)),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const ip = request ? getClientIp(request) : "unknown";
        const ipLimit = await checkRateLimitByKey(`rl:login:ip:${ip}`, {
          windowMs: 15 * 60 * 1000,
          max: 15,
        });
        if (!ipLimit.allowed) {
          throw new Error("RATE_LIMIT_EXCEEDED");
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.hashedPassword) {
          await bcrypt.compare(password, TIMING_SAFE_DUMMY_HASH);
          await checkRateLimitByKey(`rl:login:email:${email}`, {
            windowMs: 15 * 60 * 1000,
            max: 10,
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const remainingMinutes = Math.max(
            1,
            Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000))
          );
          throw new Error(`ACCOUNT_LOCKED:${remainingMinutes}`);
        }

        const valid = await bcrypt.compare(password, user.hashedPassword);
        if (!valid) {
          const newFailedAttempts = (user.failedLoginAttempts || 0) + 1;
          const willLock = newFailedAttempts >= 5;
          const lockedUntil = willLock
            ? new Date(Date.now() + 15 * 60 * 1000)
            : null;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newFailedAttempts,
              lockedUntil,
            },
          });

          if (willLock) {
            throw new Error("ACCOUNT_LOCKED:15");
          }

          return null;
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });
        }

        if (user.scheduledDeletion) {
          throw new Error(`ACCOUNT_DELETION_SCHEDULED:${user.email}`);
        }

        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, trigger }) {
      if (user && user.id) {
        token.id = user.id;
        token.plan = ((user as unknown as { plan?: string }).plan) ?? "free";
        token.workspacePlan = token.plan;
        token.workspaceId         = null;
        token.role                = null;
        token.membershipFetchedAt = undefined;
      }

      if (account && account.provider !== "credentials" && token.id) {
        try {
          const verifiedDate = new Date();
          await prisma.user.update({
            where: { id: token.id as string },
            data: { emailVerified: verifiedDate },
          });
          token.emailVerified = verifiedDate.toISOString();
        } catch (error) {
          console.error("[auth] Failed to auto-verify OAuth user email:", error);
        }
      }

      /* ── JWT refresh scheduling with jittered cadence + backoff ─────────
       *
       * BASE cadence: every 5 minutes (300s) to pick up role / plan changes.
       * JITTER:    +0–120s (2 min) randomly per-token so 100 users don't
       *            all refresh on the exact same wall-clock second during
       *            a deploy spike.
       * FORCE refresh when:
       *   - trigger === "update"   (caller explicitly used updateSession)
       *   - workspaceId is null    (new user, or post-onboarding)
       * BACKOFF when:
       *   - DB unreachable → exponential 10s / 30s / 2min cool-down so a
       *     transient pooler spike does not become a retry storm.
       */
      const BASE_REFRESH_MS  = 5 * 60 * 1000;
      const MAX_JITTER_MS    = 2 * 60 * 1000;
      const now              = Date.now();
      const lastFetch        = (token.membershipFetchedAt as number | undefined) ?? 0;

      // Deterministic-ish jitter per token so the same user doesn't keep
      // re-rolling every single request (which would defeat cadence), but
      // random ENOUGH that 100 users are spread across the window.
      // We roll it once per successful refresh and stash it on the token.
      let jitterMs = (token.refreshJitterMs as number | undefined) ?? 0;
      if (jitterMs <= 0 || jitterMs > MAX_JITTER_MS) {
        jitterMs = Math.floor(Math.random() * MAX_JITTER_MS);
      }
      const effectiveIntervalMs = BASE_REFRESH_MS + jitterMs;

      const userId = token.id as string | undefined;
      const dbBackedForce =
        trigger === "update" || token.workspaceId === null;

      const cadenceDue =
        lastFetch > 0 && now - lastFetch >= effectiveIntervalMs;

      const needsRefresh = userId && (dbBackedForce || cadenceDue);

      if (userId && needsRefresh) {
        // Don't even attempt a query if we just failed for this user and
        // are in the exponential backoff window — keep cached values.
        if (isInBackoff(userId) && trigger !== "update") {
          console.debug(
            `[auth] JWT refresh skipped for user ${userId.slice(0, 8)} — in DB backoff window.`
          );
          return token;
        }

        try {
          const [membership, dbUser] = await Promise.all([
            getWorkspaceMembership(userId),
            getJwtUserShape(userId),
          ]);

          // Treat a wholly-null result on both as pooler failure (not
          // "no such user") since it's extremely unlikely both rows would
          // be missing simultaneously. Preserve existing token values.
          const poolerFailure = membership === null && dbUser === null;
          if (poolerFailure) {
            markBackoff(userId);
            console.warn(
              "[auth] Both membership + user returned null during JWT refresh — DB unreachable, preserving cached token values."
            );
            return token;
          }

          if (dbUser?.scheduledDeletion) {
            return null;
          }

          if (dbUser) {
            let isVerified = dbUser.emailVerified;
            if (
              !isVerified &&
              (!dbUser.hashedPassword || dbUser.accounts.length > 0)
            ) {
              isVerified = new Date();
              await prisma.user
                .update({
                  where: { id: userId },
                  data: { emailVerified: isVerified },
                })
                .catch(() => {});
            }

            token.role                = membership?.role        ?? token.role;
            token.workspaceId         = membership?.workspaceId ?? token.workspaceId;
            token.plan                = dbUser.plan             ?? token.plan;
            token.workspacePlan       = token.plan;
            token.emailVerified       = isVerified
              ? isVerified.toISOString()
              : token.emailVerified;
            token.membershipFetchedAt = now;
            // Re-roll jitter for the NEXT cadence cycle on success.
            token.refreshJitterMs    = Math.floor(Math.random() * MAX_JITTER_MS);

            // Successful refresh → clear any prior backoff for this user.
            clearBackoff(userId);
          } else {
            console.warn(
              "[auth] DB unreachable during JWT refresh (user null) — preserving cached token values."
            );
            markBackoff(userId);
          }
        } catch (error) {
          if (isDbUnavailable(error)) {
            markBackoff(userId);
            console.warn(
              "[auth] DB unreachable during JWT refresh — preserving cached token values.",
              (error as { message?: string }).message
            );
          } else {
            console.error("[auth] Failed to fetch workspace membership:", error);
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id            = token.id            as string;
      session.user.role          = token.role          as string | null;
      session.user.workspaceId   = token.workspaceId   as string | null;
      session.user.workspacePlan = token.workspacePlan as string | null;
      session.user.emailVerified = token.emailVerified
        ? new Date(token.emailVerified)
        : null;
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (account?.provider && account.provider !== "credentials" && user?.id) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { emailVerified: new Date() },
          });
        } catch (err) {
          console.error("[auth] Event signIn OAuth auto-verify error:", err);
        }
      }
    },
  },
});
