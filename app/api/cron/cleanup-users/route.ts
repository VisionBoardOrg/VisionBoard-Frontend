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

  const expectedSecret = process.env.CRON_SECRET || "dev-cron-secret";

  if (process.env.NODE_ENV === "production" && token !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runUserCleanup();

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...result,
  });
}
