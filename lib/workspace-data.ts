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
import { Prisma } from "@prisma/client";
import type {
  MemberRole,
  PlanTier,
  WorkspaceMember,
  Workspace,
  User,
} from "@prisma/client";
import type {
  DashboardGoal,
  DashboardMember,
  DashboardMyTask,
  DashboardTaskStats,
} from "@/types/dashboard";

/* ─── Cache / inflight plumbing (reusable per-process maps) ───────────── */
const CACHE_TTL_MS = 10 * 1000;
const OVERVIEW_CACHE_TTL_MS = 20 * 1000;

type SlimMember = WorkspaceMember & {
  workspace: Pick<Workspace, "id" | "name" | "ownerId"> & {
    owner: Pick<User, "plan">;
  };
};
type SlimUser   = Pick<User, "id" | "plan" | "aiCreditsUsed">;

export interface WorkspaceOverviewData {
  id: string;
  name: string;
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    email: string;
    plan: PlanTier;
  };
  _count: {
    goals: number;
    documents: number;
    members: number;
  };
  members: DashboardMember[];
  goals: DashboardGoal[];
  taskStats: DashboardTaskStats;
  myTasks: DashboardMyTask[];
  myTasksTotal: number;
}

type CacheEntry<T> = { v: T; ts: number };

const globalForWsCache = globalThis as unknown as {
  wsInflightSlim?:            Map<string, Promise<SlimMember | null>>;
  wsCacheSlim?:               Map<string, CacheEntry<SlimMember | null>>;
  wsInflightUserMemberships?: Map<string, Promise<SlimMember[]>>;
  wsCacheUserMemberships?:    Map<string, CacheEntry<SlimMember[]>>;
  wsInflightUserPlan?:        Map<string, Promise<SlimUser | null>>;
  wsCacheUserPlan?:           Map<string, CacheEntry<SlimUser | null>>;
  wsInflightName?:            Map<string, Promise<Pick<Workspace, "name"> | null>>;
  wsCacheName?:               Map<string, CacheEntry<Pick<Workspace, "name"> | null>>;
  wsInflightOverview?:        Map<string, Promise<WorkspaceOverviewData | null>>;
  wsCacheOverview?:           Map<string, CacheEntry<WorkspaceOverviewData | null>>;
};

const inflightSlim: Map<string, Promise<SlimMember | null>> =
  (globalForWsCache.wsInflightSlim ??= new Map());
const cacheSlim: Map<string, CacheEntry<SlimMember | null>> =
  (globalForWsCache.wsCacheSlim ??= new Map());
const inflightUserMemberships: Map<string, Promise<SlimMember[]>> =
  (globalForWsCache.wsInflightUserMemberships ??= new Map());
const cacheUserMemberships: Map<string, CacheEntry<SlimMember[]>> =
  (globalForWsCache.wsCacheUserMemberships ??= new Map());
const inflightUserPlan: Map<string, Promise<SlimUser | null>> =
  (globalForWsCache.wsInflightUserPlan ??= new Map());
const cacheUserPlan: Map<string, CacheEntry<SlimUser | null>> =
  (globalForWsCache.wsCacheUserPlan ??= new Map());
const inflightName: Map<string, Promise<Pick<Workspace, "name"> | null>> =
  (globalForWsCache.wsInflightName ??= new Map());
const cacheName: Map<string, CacheEntry<Pick<Workspace, "name"> | null>> =
  (globalForWsCache.wsCacheName ??= new Map());
const inflightOverview: Map<string, Promise<WorkspaceOverviewData | null>> =
  (globalForWsCache.wsInflightOverview ??= new Map());
const cacheOverview: Map<string, CacheEntry<WorkspaceOverviewData | null>> =
  (globalForWsCache.wsCacheOverview ??= new Map());

function getCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  now: number,
  ttlMs: number = CACHE_TTL_MS
): T | undefined {
  const entry = map.get(key);
  if (entry && now - entry.ts < ttlMs) return entry.v;
  if (entry) map.delete(key);
  return undefined;
}
function setCached<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  now: number,
  ttlMs: number = CACHE_TTL_MS
) {
  map.set(key, { v: value, ts: now });
  if (map.size > 300) {
    const cutoff = now - ttlMs;
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
  cacheMap: Map<string, CacheEntry<T>>,
  factory: () => Promise<T>,
  ttlMs: number = CACHE_TTL_MS
): Promise<T> {
  const now = Date.now();
  const cached = getCached(cacheMap, key, now, ttlMs);
  if (cached !== undefined) return cached as T;
  const existing = inflight.get(key);
  if (existing) {
    try {
      const v = await existing;
      setCached(cacheMap, key, v, Date.now(), ttlMs);
      return v;
    } catch {
      /* fall through */
    }
  }
  const p = factory();
  inflight.set(key, p);
  try {
    const v = await p;
    setCached(cacheMap, key, v, Date.now(), ttlMs);
    return v;
  } finally {
    if (inflight.get(key) === p) inflight.delete(key);
  }
}

/* ─── Public cached helpers ────────────────────────────────────────────── */

/**
 * All workspace memberships for a user (ordered by joinedAt) in a single SQL JOIN.
 * Used by WorkspaceLayout to populate the workspace switcher AND resolve the active
 * workspace + owner plan in one round-trip, while seeding `cacheSlim` and `cacheName`
 * so the active page's `getSlimWorkspaceMembership` and `getWorkspaceName` are 0-DB hits.
 */
export const getUserWorkspaceMemberships = cache(
  async (userId: string): Promise<SlimMember[]> => {
    const list = await dedupe(
      `um:${userId}`,
      inflightUserMemberships,
      cacheUserMemberships,
      () =>
        prisma.workspaceMember.findMany({
          relationLoadStrategy: "join",
          where: { userId },
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                owner: { select: { plan: true } },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        })
    );
    const now = Date.now();
    for (const m of list) {
      setCached(cacheSlim, `sm:${m.workspaceId}:${userId}`, m, now);
      setCached(cacheName, `wn:${m.workspaceId}`, { name: m.workspace.name }, now);
    }
    return list;
  }
);

/**
 * Slim workspace membership — exactly what the layout and workspace pages need
 * for role/owner checks. Coalesces with cached or in-flight
 * `getUserWorkspaceMemberships(userId)` so layout + page never run duplicate DB
 * round-trips in the same request.
 */
export const getSlimWorkspaceMembership = cache(
  async (workspaceId: string, userId: string): Promise<SlimMember | null> => {
    const slimKey = `sm:${workspaceId}:${userId}`;
    const now = Date.now();

    const cachedSlim = getCached(cacheSlim, slimKey, now);
    if (cachedSlim !== undefined) return cachedSlim;

    const umKey = `um:${userId}`;
    const cachedAll = getCached(cacheUserMemberships, umKey, now);
    if (cachedAll !== undefined) {
      const match = cachedAll.find((m) => m.workspaceId === workspaceId) ?? null;
      setCached(cacheSlim, slimKey, match, now);
      return match;
    }

    const inflightAll = inflightUserMemberships.get(umKey);
    if (inflightAll) {
      try {
        const list = await inflightAll;
        const match = list.find((m) => m.workspaceId === workspaceId) ?? null;
        setCached(cacheSlim, slimKey, match, Date.now());
        return match;
      } catch {
        /* fall through to direct lookup */
      }
    }

    const res = await dedupe(
      slimKey,
      inflightSlim,
      cacheSlim,
      () =>
        prisma.workspaceMember.findUnique({
          relationLoadStrategy: "join",
          where: {
            workspaceId_userId: { workspaceId, userId },
          },
          include: {
            workspace: {
              select: {
                id: true,
                name: true,
                ownerId: true,
                owner: { select: { plan: true } },
              },
            },
          },
        })
    );
    if (res) {
      setCached(cacheName, `wn:${workspaceId}`, { name: res.workspace.name }, Date.now());
    }
    return res;
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

type RawOverviewRow = {
  id: string;
  name: string;
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    email: string;
    plan: string;
  };
  goalsCount: number | bigint;
  documentsCount: number | bigint;
  membersCount: number | bigint;
  members: Array<{
    id: string;
    workspaceId: string;
    userId: string;
    role: string;
    joinedAt: string;
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
    };
  }> | null;
  goals: Array<{
    id: string;
    title: string;
    status: string;
    healthScore: number;
    targetDate: string | null;
    milestones: Array<{
      id: string;
      title: string;
      status: string;
      targetDate: string | null;
    }> | null;
  }> | null;
  taskCounts: Array<{ status: string; count: number }> | null;
  myTasksTotal: number | bigint;
  myTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
  }> | null;
};

async function fetchWorkspaceOverviewSingleQuery(
  workspaceId: string,
  userId: string,
  includeAllMembers: boolean
): Promise<WorkspaceOverviewData | null> {
  const memberLimitSql = includeAllMembers ? Prisma.empty : Prisma.sql`LIMIT 4`;

  const rows = await prisma.$queryRaw<RawOverviewRow[]>`
    WITH ws AS (
      SELECT
        w."id",
        w."name",
        w."ownerId",
        json_build_object(
          'id', u."id",
          'name', u."name",
          'email', u."email",
          'plan', u."plan"::text
        ) AS "owner"
      FROM "Workspace" w
      INNER JOIN "User" u ON u."id" = w."ownerId"
      WHERE w."id" = ${workspaceId}
      LIMIT 1
    ),
    member_rows AS (
      SELECT
        wm."id",
        wm."workspaceId",
        wm."userId",
        wm."role"::text AS "role",
        wm."joinedAt",
        json_build_object(
          'id', u."id",
          'name', u."name",
          'email', u."email",
          'image', u."image"
        ) AS "user"
      FROM "WorkspaceMember" wm
      INNER JOIN "User" u ON u."id" = wm."userId"
      WHERE wm."workspaceId" = ${workspaceId}
      ORDER BY wm."joinedAt" ASC
      ${memberLimitSql}
    ),
    goal_rows AS (
      SELECT
        g."id",
        g."title",
        g."status"::text AS "status",
        g."healthScore",
        g."targetDate",
        g."createdAt",
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', m."id",
                'title', m."title",
                'status', m."status"::text,
                'targetDate', m."targetDate"
              )
              ORDER BY m."order" ASC, m."createdAt" ASC
            )
            FROM "Milestone" m
            WHERE m."goalId" = g."id"
          ),
          '[]'::json
        ) AS "milestones"
      FROM "Goal" g
      WHERE g."workspaceId" = ${workspaceId}
      ORDER BY g."createdAt" ASC
    ),
    task_counts AS (
      SELECT
        t."status"::text AS "status",
        COUNT(*)::int AS "count"
      FROM "Task" t
      WHERE t."workspaceId" = ${workspaceId}
      GROUP BY t."status"
    ),
    my_assigned_tasks AS (
      SELECT
        t."id",
        t."title",
        t."status"::text AS "status",
        t."priority"::text AS "priority",
        t."createdAt"
      FROM "Task" t
      INNER JOIN "TaskAssignment" ta ON ta."taskId" = t."id"
      WHERE t."workspaceId" = ${workspaceId}
        AND ta."userId" = ${userId}
      ORDER BY t."createdAt" DESC
    )
    SELECT
      ws."id",
      ws."name",
      ws."ownerId",
      ws."owner",
      (SELECT COUNT(*)::int FROM "Goal" WHERE "workspaceId" = ${workspaceId}) AS "goalsCount",
      (SELECT COUNT(*)::int FROM "Document" WHERE "workspaceId" = ${workspaceId}) AS "documentsCount",
      (SELECT COUNT(*)::int FROM "WorkspaceMember" WHERE "workspaceId" = ${workspaceId}) AS "membersCount",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', mr."id",
              'workspaceId', mr."workspaceId",
              'userId', mr."userId",
              'role', mr."role",
              'joinedAt', mr."joinedAt",
              'user', mr."user"
            )
            ORDER BY mr."joinedAt" ASC
          )
          FROM member_rows mr
        ),
        '[]'::json
      ) AS "members",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', gr."id",
              'title', gr."title",
              'status', gr."status",
              'healthScore', gr."healthScore",
              'targetDate', gr."targetDate",
              'milestones', gr."milestones"
            )
            ORDER BY gr."createdAt" ASC
          )
          FROM goal_rows gr
        ),
        '[]'::json
      ) AS "goals",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object('status', tc."status", 'count', tc."count")
          )
          FROM task_counts tc
        ),
        '[]'::json
      ) AS "taskCounts",
      (SELECT COUNT(*)::int FROM my_assigned_tasks) AS "myTasksTotal",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', mt."id",
              'title', mt."title",
              'status', mt."status",
              'priority', mt."priority"
            )
          )
          FROM (SELECT * FROM my_assigned_tasks LIMIT 6) mt
        ),
        '[]'::json
      ) AS "myTasks"
    FROM ws
  `;

  const row = rows[0];
  if (!row) return null;

  const byStatus = {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    blocked: 0,
    done: 0,
  };
  let totalTasks = 0;
  for (const tc of row.taskCounts ?? []) {
    const count = Number(tc.count) || 0;
    totalTasks += count;
    if (tc.status in byStatus) {
      byStatus[tc.status as keyof typeof byStatus] = count;
    }
  }

  const members: DashboardMember[] = (row.members ?? []).map((m) => ({
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role as MemberRole,
    joinedAt: new Date(m.joinedAt),
    user: m.user,
  }));

  const goals: DashboardGoal[] = (row.goals ?? []).map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status,
    healthScore: Number(g.healthScore) || 0,
    targetDate: g.targetDate ? new Date(g.targetDate) : null,
    milestones: (g.milestones ?? []).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      targetDate: m.targetDate ? new Date(m.targetDate) : null,
      tasks: [],
    })),
  }));

  return {
    id: row.id,
    name: row.name,
    ownerId: row.ownerId,
    owner: {
      id: row.owner.id,
      name: row.owner.name,
      email: row.owner.email,
      plan: row.owner.plan as PlanTier,
    },
    _count: {
      goals: Number(row.goalsCount) || 0,
      documents: Number(row.documentsCount) || 0,
      members: Number(row.membersCount) || 0,
    },
    members,
    goals,
    taskStats: {
      total: totalTasks,
      done: byStatus.done,
      blocked: byStatus.blocked,
      byStatus,
    },
    myTasks: row.myTasks ?? [],
    myTasksTotal: Number(row.myTasksTotal) || 0,
  };
}

/**
 * Single-SQL-CTE workspace overview loader (workspace + owner + counts +
 * members + goals/milestones + task status counts + top 6 assigned tasks)
 * with 20s in-memory caching and in-flight deduplication.
 *
 * Uses 1 DB connection and 1 round-trip instead of 4-5 concurrent Prisma
 * queries, preventing pool starvation against /api/notifications and powering
 * all 4 client dashboard lenses (PM / Exec / Eng / Marketing) simultaneously.
 */
export const getWorkspaceOverviewData = cache(
  async (
    workspaceId: string,
    userId: string,
    includeAllMembers: boolean
  ): Promise<WorkspaceOverviewData | null> => {
    const key = `ov:${workspaceId}:${userId}:${includeAllMembers ? 1 : 0}`;
    const res = await dedupe(
      key,
      inflightOverview,
      cacheOverview,
      () => fetchWorkspaceOverviewSingleQuery(workspaceId, userId, includeAllMembers),
      OVERVIEW_CACHE_TTL_MS
    );
    if (res) {
      setCached(cacheName, `wn:${workspaceId}`, { name: res.name }, Date.now());
    }
    return res;
  }
);

/**
 * Evict cached workspace metadata/overview entries after mutations
 * (e.g. role updates, member changes, workspace renames).
 */
export function invalidateWorkspaceDataCache(params: {
  workspaceId?: string;
  userId?: string;
}): void {
  const { workspaceId, userId } = params;
  if (workspaceId) {
    cacheName.delete(`wn:${workspaceId}`);
    const ovPrefix = `ov:${workspaceId}:`;
    for (const k of Array.from(cacheOverview.keys())) {
      if (k.startsWith(ovPrefix)) cacheOverview.delete(k);
    }
    const smPrefix = `sm:${workspaceId}:`;
    for (const k of Array.from(cacheSlim.keys())) {
      if (k.startsWith(smPrefix)) cacheSlim.delete(k);
    }
  }
  if (userId) {
    cacheUserMemberships.delete(`um:${userId}`);
    cacheUserPlan.delete(`up:${userId}`);
    for (const k of Array.from(cacheSlim.keys())) {
      if (k.endsWith(`:${userId}`)) cacheSlim.delete(k);
    }
  }
}

export type { SlimMember, SlimUser };
