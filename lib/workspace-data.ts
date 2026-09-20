/**
 * lib/workspace-data.ts — Shared workspace-context query helpers.
 *
 * Problem fixed here:
 *   For every workspace route, BOTH the workspace layout AND the page
 *   component (and generateMetadata) run their own prisma queries:
 *     layout: workspaceMember.findUnique(include: { workspace })
 *             + user.findUnique(select: { plan, aiCreditsUsed })
 *     page:   workspaceMember.findUnique(huge include graph)
 *             + user.findUnique(select: { plan, aiCreditsUsed })
 *   That's 4 round-trips per request, many holding concurrent connections.
 *
 * Strategy (2-layer dedup, same as lib/auth/index.ts):
 *   1. React.cache()            → dedup WITHIN a single request
 *                                  (layout ↔ page ↔ generateMetadata)
 *   2. inflight Promise + short-TTL map → dedup ACROSS concurrent requests
 *                                  (user's tab1 + tab2 + background API calls)
 *
 * Note: pages that need different include graphs (e.g. WorkspacePage which
 * needs members+goals for the dashboard) still run their own big query —
 * the layout-level slim query is NOT forced on them. But both now share the
 * user-plan lookup, and the slim-member query can return its cached result
 * to any caller with the same signature.
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import "server-only";
import type { PlanTier, WorkspaceMember, Workspace, User } from "@prisma/client";

/* ─── Cache / inflight plumbing (reusable per-process maps) ───────────── */
const CACHE_TTL_MS = 10 * 1000;

type SlimMember = WorkspaceMember & {
  workspace: Pick<Workspace, "id" | "name" | "ownerId">;
};
type SlimUser   = Pick<User, "id" | "plan" | "aiCreditsUsed">;

type CacheEntry<T> = { v: T; ts: number };

const globalForWsCache = globalThis as unknown as {
  wsInflightSlim?:     Map<string, Promise<SlimMember | null>>;
  wsCacheSlim?:        Map<string, CacheEntry<SlimMember | null>>;
  wsInflightUserPlan?: Map<string, Promise<SlimUser | null>>;
  wsCacheUserPlan?:    Map<string, CacheEntry<SlimUser | null>>;
  wsInflightName?:     Map<string, Promise<Pick<Workspace, "name"> | null>>;
  wsCacheName?:        Map<string, CacheEntry<Pick<Workspace, "name"> | null>>;
};

const inflightSlim     = (globalForWsCache.wsInflightSlim     ??= new Map());
const cacheSlim        = (globalForWsCache.wsCacheSlim        ??= new Map());
const inflightUserPlan = (globalForWsCache.wsInflightUserPlan ??= new Map());
const cacheUserPlan    = (globalForWsCache.wsCacheUserPlan    ??= new Map());
const inflightName     = (globalForWsCache.wsInflightName     ??= new Map());
const cacheName        = (globalForWsCache.wsCacheName        ??= new Map());

function getCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  now: number
): T | undefined {
  const entry = map.get(key);
  if (entry && now - entry.ts < CACHE_TTL_MS) return entry.v;
  if (entry) map.delete(key);
  return undefined;
}
function setCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  now: number
) {
  map.set(key, { v: value, ts: now });
  if (map.size > 300) {
    const cutoff = now - CACHE_TTL_MS;
    for (const [k, e] of Array.from(map.entries())) {
      if (e.ts < cutoff) map.delete(k);
    }
    while (map.size > 250) {
      const k = map.keys().next().value;
      if (k === undefined) break;
      map.delete(k);
    }
  }
}
async function dedupe<T>(
  key: string,
  inflight: Map<string, Promise<T>>,
  cache: Map<string, CacheEntry<T>>,
  factory: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = getCached(cache, key, now);
  if (cached !== undefined) return cached as T;
  const existing = inflight.get(key);
  if (existing) {
    try {
      const v = await existing;
      setCached(cache, key, v, Date.now());
      return v;
    } catch {
      /* fall through */
    }
  }
  const p = factory();
  inflight.set(key, p);
  try {
    const v = await p;
    setCached(cache, key, v, Date.now());
    return v;
  } finally {
    if (inflight.get(key) === p) inflight.delete(key);
  }
}

/* ─── Public cached helpers ────────────────────────────────────────────── */

/**
 * Slim workspace membership — exactly what the layout needs for role/owner
 * checks and AppShell. Shared between workspace layout + workspace page and
 * any other workspace-route component that needs this shape.
 */
export const getSlimWorkspaceMembership = cache(
  async (workspaceId: string, userId: string): Promise<SlimMember | null> => {
    return dedupe(
      `sm:${workspaceId}:${userId}`,
      inflightSlim,
      cacheSlim,
      () =>
        prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId, userId },
          },
          include: {
            workspace: { select: { id: true, name: true, ownerId: true } },
          },
        })
    );
  }
);

/**
 * User plan + credits lookup — used by workspace layout AND every workspace
 * page to compute PLAN_LIMITS. Sharing this cuts one DB round-trip per page
 * that was previously duplicating the layout's query.
 */
export const getUserPlanAndCredits = cache(
  async (userId: string): Promise<SlimUser | null> => {
    return dedupe(
      `up:${userId}`,
      inflightUserPlan,
      cacheUserPlan,
      () =>
        prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, plan: true, aiCreditsUsed: true },
        })
    );
  }
);

/**
 * Workspace name-only lookup — used by generateMetadata across all
 * workspace sub-routes. Previously each workspace page repeated the same
 * prisma.workspace.findUnique({where:{id},select:{name}}).
 */
export const getWorkspaceName = cache(async (workspaceId: string) => {
  return dedupe(
    `wn:${workspaceId}`,
    inflightName,
    cacheName,
    () =>
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true },
      })
  );
});

export type { SlimMember, SlimUser };
