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
import { runUserCleanup } from "@/lib/user-cleanup";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const token = cronSecretHeader || bearerToken;

  // SECURITY: Always enforce the cron secret — never skip auth based on NODE_ENV.
  // A hardcoded fallback would allow unauthenticated access on staging/preview deployments.
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("[cron/cleanup-users] CRON_SECRET env var is not set — refusing to run.");
    return NextResponse.json({ error: "Cron not configured" }, { status: 500 });
  }

  if (!token || token !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runUserCleanup();

  // SECURITY (LOW-4): Log purged user IDs server-side only — never include them
  // in the HTTP response where a compromised cron token could expose them.
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
