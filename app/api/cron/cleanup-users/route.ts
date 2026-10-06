/**
 * GET /api/cron/cleanup-users
 *
 * Nightly cleanup cron job.
 * Executes two automated operations:
 * 1. Dispatches 7-day final warning reminder emails to users approaching permanent deletion.
 * 2. Permanently purges user accounts (and their owned workspaces/data) whose 30-day scheduledDeletion period has expired.
 *
 * Can be triggered by Vercel Cron, node-cron, or external HTTP schedulers.
 * Protected by CRON_SECRET token verification + Vercel Cron IP allowlist + distributed lock.
 */

import { NextRequest, NextResponse } from "next/server";
import { runUserCleanup } from "@/lib/user-cleanup";
import { authorizeCron } from "@/lib/cron-auth";
import { acquireCronLock } from "@/lib/cron-lock";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.authorized) {
    console.warn(`[cron/cleanup-users] Auth failed: ${auth.error ?? "unknown"}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { acquired } = await acquireCronLock("cleanup-users", 10 * 60 * 1000);
  if (!acquired) {
    console.log(
      "[cron/cleanup-users] Parallel trigger detected — skipping (lock held by another run)."
    );
    return NextResponse.json(
      { skipped: true, reason: "parallel run in progress" },
      { status: 409 }
    );
  }

  const result = await runUserCleanup();

  if (result.purgedUserIds.length > 0) {
    console.log("[cron/cleanup-users] Purged user IDs:", result.purgedUserIds);
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    warningsSent: result.warningsSent,
    purgedCount: result.purgedCount,
  });
}

