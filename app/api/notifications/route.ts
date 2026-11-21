import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { leanAuth } from "@/lib/auth/lean";
import { prisma } from "@/lib/prisma";
import {
  buildNotificationCacheKey,
  getOrFetchNotifications,
  invalidateUserNotificationCache,
  type CachedNotificationsResult,
} from "@/lib/notification-cache";
import { z } from "zod";
import { Prisma, type NotificationType } from "@prisma/client";

const patchSchema = z.object({
  notificationIds: z.array(z.string()).optional(),
  all: z.boolean().optional(),
  workspaceId: z.string().optional(),
});

const MENTION_TYPES: NotificationType[] = ["comment_mention"];
const TASK_TYPES: NotificationType[] = [
  "task_assigned",
  "task_status_changed",
  "task_blocked",
  "task_due_soon",
  "task_overdue",
];
const SYSTEM_TYPES: NotificationType[] = [
  "milestone_delayed",
  "milestone_completed",
  "goal_at_risk",
  "goal_health_degraded",
  "quota_warning",
  "quota_exceeded",
  "billing_payment_failed",
  "billing_payment_succeeded",
  "workspace_invite",
  "role_changed",
  "system_alert",
];

type RawCombinedRow = {
  unreadCount: number | bigint;
  rows: Array<{ id: string; [key: string]: unknown }> | null;
};

function getCategoryTypes(category: string): NotificationType[] | null {
  if (category === "mentions") return MENTION_TYPES;
  if (category === "tasks") return TASK_TYPES;
  if (category === "system") return SYSTEM_TYPES;
  return null;
}

async function fetchNotificationsSingleQuery(params: {
  userId: string;
  workspaceId: string | null;
  typeList: NotificationType[] | null;
  unreadOnly: boolean;
  limit: number;
}): Promise<CachedNotificationsResult> {
  const { userId, workspaceId, typeList, unreadOnly, limit } = params;

  const conditions: Prisma.Sql[] = [Prisma.sql`n."userId" = ${userId}`];
  if (workspaceId) {
    conditions.push(Prisma.sql`n."workspaceId" = ${workspaceId}`);
  }
  if (unreadOnly) {
    conditions.push(Prisma.sql`n."read" = false`);
  }
  if (typeList && typeList.length > 0) {
    conditions.push(Prisma.sql`n."type"::text IN (${Prisma.join(typeList)})`);
  }

  const whereClause = Prisma.join(conditions, " AND ");
  const unreadWorkspaceClause = workspaceId
    ? Prisma.sql`AND "workspaceId" = ${workspaceId}`
    : Prisma.empty;

  const result = await prisma.$queryRaw<RawCombinedRow[]>`
    WITH filtered AS (
      SELECT
        n."id",
        n."userId",
        n."workspaceId",
        n."actorId",
        n."type"::text AS "type",
        n."title",
        n."message",
        n."entityType",
        n."entityId",
        n."link",
        n."read",
        CASE WHEN n."readAt" IS NOT NULL
          THEN to_char(n."readAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          ELSE NULL
        END AS "readAt",
        n."metadata",
        to_char(n."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        CASE WHEN u."id" IS NOT NULL
          THEN json_build_object(
            'id', u."id",
            'name', u."name",
            'image', u."image",
            'email', u."email"
          )
          ELSE NULL
        END AS "actor",
        CASE WHEN w."id" IS NOT NULL
          THEN json_build_object(
            'id', w."id",
            'name', w."name",
            'slug', w."slug"
          )
          ELSE NULL
        END AS "workspace",
        n."createdAt" AS "_sortCreatedAt"
      FROM "Notification" n
      LEFT JOIN "User" u ON u."id" = n."actorId"
      LEFT JOIN "Workspace" w ON w."id" = n."workspaceId"
      WHERE ${whereClause}
      ORDER BY n."createdAt" DESC, n."id" DESC
      LIMIT ${limit + 1}
    ),
    unread AS (
      SELECT COUNT(*)::int AS "unreadCount"
      FROM "Notification"
      WHERE "userId" = ${userId}
        AND "read" = false
        ${unreadWorkspaceClause}
    )
    SELECT
      (SELECT "unreadCount" FROM unread) AS "unreadCount",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', f."id",
              'userId', f."userId",
              'workspaceId', f."workspaceId",
              'actorId', f."actorId",
              'type', f."type",
              'title', f."title",
              'message', f."message",
              'entityType', f."entityType",
              'entityId', f."entityId",
              'link', f."link",
              'read', f."read",
              'readAt', f."readAt",
              'metadata', f."metadata",
              'createdAt', f."createdAt",
              'actor', f."actor",
              'workspace', f."workspace"
            )
            ORDER BY f."_sortCreatedAt" DESC, f."id" DESC
          )
          FROM filtered f
        ),
        '[]'::json
      ) AS "rows"
  `;

  const row = result[0];
  const notifications = Array.isArray(row?.rows) ? [...row.rows] : [];
  let nextCursor: string | null = null;
  if (notifications.length > limit) {
    const nextItem = notifications.pop();
    nextCursor = nextItem?.id ?? null;
  }

  return {
    notifications,
    unreadCount: Number(row?.unreadCount ?? 0),
    nextCursor,
  };
}

export async function GET(request: NextRequest) {
  const tStart = performance.now();
  // Lean JWT-only auth: verifies encrypted session cookie locally (0 DB queries).
  const session = await leanAuth();
  const authMs = performance.now() - tStart;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const category = searchParams.get("category") || "all";
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const countOnly = searchParams.get("countOnly") === "true";
  const parsedLimit = parseInt(searchParams.get("limit") || "30", 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
  const cursor = searchParams.get("cursor");
  const typeList = getCategoryTypes(category);

  const cacheKey = buildNotificationCacheKey({
    userId,
    workspaceId,
    category,
    unreadOnly,
    limit,
    cursor,
    countOnly,
  });

  try {
    const dbStart = performance.now();
    const { data, cacheStatus } = await getOrFetchNotifications(cacheKey, async () => {
      if (countOnly) {
        const unreadCount = await prisma.notification.count({
          where: {
            userId,
            read: false,
            ...(workspaceId ? { workspaceId } : {}),
          },
        });
        return { notifications: [], unreadCount, nextCursor: null };
      }

      if (cursor) {
        const where: Prisma.NotificationWhereInput = {
          userId,
          ...(workspaceId ? { workspaceId } : {}),
          ...(unreadOnly ? { read: false } : {}),
          ...(typeList ? { type: { in: typeList } } : {}),
        };

        const notifications = await prisma.notification.findMany({
          relationLoadStrategy: "join",
          where,
          take: limit + 1,
          cursor: { id: cursor },
          skip: 1,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            actor: { select: { id: true, name: true, image: true, email: true } },
            workspace: { select: { id: true, name: true, slug: true } },
          },
        });

        let nextCursor: string | null = null;
        if (notifications.length > limit) {
          const nextItem = notifications.pop();
          nextCursor = nextItem?.id ?? null;
        }

        return { notifications, unreadCount: null, nextCursor };
      }

      // Single-query CTE: fetches notifications + unreadCount in 1 DB round-trip & 1 pool slot.
      return fetchNotificationsSingleQuery({
        userId,
        workspaceId,
        typeList,
        unreadOnly,
        limit,
      });
    });

    const dbMs = performance.now() - dbStart;
    const totalMs = performance.now() - tStart;

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[GET /api/notifications] timing: cache=${cacheStatus} | total=${totalMs.toFixed(1)}ms | auth=${authMs.toFixed(1)}ms | db=${dbMs.toFixed(1)}ms | rows=${data.notifications.length}`
      );
    }

    const response = NextResponse.json(data);

    if (process.env.NODE_ENV !== "production") {
      response.headers.set(
        "Server-Timing",
        `auth;dur=${authMs.toFixed(1)}, db;dur=${dbMs.toFixed(1)};desc="${cacheStatus}", total;dur=${totalMs.toFixed(1)}`
      );
    }

    return response;
  } catch (err) {
    console.error("[GET /api/notifications] Failed to fetch notifications:", err);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { notificationIds, all, workspaceId } = parsed.data;

  try {
    const now = new Date();

    if (all) {
      const result = await prisma.notification.updateMany({
        where: {
          userId: session.user.id,
          read: false,
          ...(workspaceId ? { workspaceId } : {}),
        },
        data: {
          read: true,
          readAt: now,
        },
      });

      invalidateUserNotificationCache(session.user.id);
      return NextResponse.json({ success: true, count: result.count });
    }

    if (notificationIds && notificationIds.length > 0) {
      const result = await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: session.user.id,
        },
        data: {
          read: true,
          readAt: now,
        },
      });

      invalidateUserNotificationCache(session.user.id);
      return NextResponse.json({ success: true, count: result.count });
    }

    return NextResponse.json({ error: "No notification specified" }, { status: 400 });
  } catch (err) {
    console.error("[PATCH /api/notifications] Failed to mark notifications read:", err);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const clearRead = searchParams.get("clearRead") === "true";
  const workspaceId = searchParams.get("workspaceId");

  try {
    if (clearRead) {
      const result = await prisma.notification.deleteMany({
        where: {
          userId: session.user.id,
          read: true,
          ...(workspaceId ? { workspaceId } : {}),
        },
      });
      invalidateUserNotificationCache(session.user.id);
      return NextResponse.json({ success: true, count: result.count });
    }

    if (!id) {
      return NextResponse.json({ error: "id parameter required" }, { status: 400 });
    }

    await prisma.notification.deleteMany({
      where: {
        id,
        userId: session.user.id,
      },
    });

    invalidateUserNotificationCache(session.user.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/notifications] Failed to delete notification:", err);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
