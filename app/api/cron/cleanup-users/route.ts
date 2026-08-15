/**
 * GET /api/cron/cleanup-users
 *
 * Nightly cleanup cron job.
 * Executes two automated operations:
 * 1. Dispatches 7-day final warning reminder emails to users approaching permanent deletion.
 * 2. Permanently purges user accounts (and their owned workspaces/data) whose 30-day scheduledDeletion period has expired.
 *
 * Can be triggered by Vercel Cron, node-cron, or external HTTP schedulers.
 * Protected by CRON_SECRET token verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendFinalDeletionWarningEmail } from "@/lib/account-deletion-email";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = cronSecretHeader || bearerToken;

  const expectedSecret = process.env.CRON_SECRET || "dev-cron-secret";

  if (process.env.NODE_ENV === "production" && token !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // ── 1. Dispatches 7-day final warning reminder emails ────────────────────
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sixDaysFromNow   = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const usersForWarning = await prisma.user.findMany({
    where: {
      scheduledDeletion: {
        gte: sixDaysFromNow,
        lte: sevenDaysFromNow,
      },
    },
    select: { id: true, email: true, name: true, scheduledDeletion: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  let warningsSent = 0;

  for (const user of usersForWarning) {
    if (user.scheduledDeletion) {
      const cancelUrl = `${baseUrl}/auth/cancel-deletion?email=${encodeURIComponent(user.email)}`;
      await sendFinalDeletionWarningEmail({
        email: user.email,
        name: user.name,
        scheduledDeletionDate: user.scheduledDeletion,
        cancelUrl,
      }).catch((e) => console.error(`[cron] Warning email failed for ${user.email}:`, e));
      warningsSent++;
    }
  }

  // ── 2. Permanently purges user accounts past 30 days ──────────────────────
  const expiredUsers = await prisma.user.findMany({
    where: {
      scheduledDeletion: {
        lte: now,
      },
    },
    select: { id: true, email: true },
  });

  const purgedUserIds: string[] = [];

  for (const user of expiredUsers) {
    try {
      // 1. Delete all workspaces owned by this user.
      // Schema cascades will purge all goals, milestones, tasks, documents, board items, etc.
      await prisma.workspace.deleteMany({
        where: { ownerId: user.id },
      });

      // 2. Delete the user record itself.
      // Schema cascades will purge sessions, accounts, memberships, activity logs, etc.
      await prisma.user.delete({
        where: { id: user.id },
      });

      purgedUserIds.push(user.id);
      console.log(`[cron] Permanently purged user ${user.email} (${user.id}) after 30 days.`);
    } catch (error) {
      console.error(`[cron] Failed to purge user ${user.id}:`, error);
    }
  }

  return NextResponse.json({
    success: true,
    timestamp: now.toISOString(),
    warningsSent,
    purgedCount: purgedUserIds.length,
    purgedUserIds,
  });
}
