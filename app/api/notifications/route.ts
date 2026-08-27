import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { NotificationType, Prisma } from "@prisma/client";

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

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const category = searchParams.get("category") || "all";
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10)));
  const cursor = searchParams.get("cursor");

  const where: Prisma.NotificationWhereInput = {
    userId: session.user.id,
  };

  if (workspaceId) {
    where.workspaceId = workspaceId;
  }

  if (unreadOnly) {
    where.read = false;
  }

  if (category === "mentions") {
    where.type = { in: MENTION_TYPES };
  } else if (category === "tasks") {
    where.type = { in: TASK_TYPES };
  } else if (category === "system") {
    where.type = { in: SYSTEM_TYPES };
  }

  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0,
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, name: true, image: true, email: true } },
          workspace: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.notification.count({
        where: {
          userId: session.user.id,
          read: false,
          ...(workspaceId ? { workspaceId } : {}),
        },
      }),
    ]);

    let nextCursor: string | null = null;
    let items = notifications;
    if (notifications.length > limit) {
      const nextItem = notifications.pop();
      nextCursor = nextItem?.id ?? null;
      items = notifications;
    }

    return NextResponse.json({
      notifications: items,
      unreadCount,
      nextCursor,
    });
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/notifications] Failed to delete notification:", err);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
