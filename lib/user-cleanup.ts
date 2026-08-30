import { prisma } from "@/lib/prisma";
import { sendFinalDeletionWarningEmail } from "@/lib/account-deletion-email";
import { signCancelDeletionToken } from "@/lib/deletion-token";

export interface UserCleanupResult {
  warningsSent: number;
  purgedCount: number;
  purgedUserIds: string[];
}

/**
 * Executes automated account deletion operations:
 * 1. Dispatches 7-day final warning reminder emails to users approaching deletion.
 * 2. Permanently purges accounts whose 30-day scheduledDeletion period has expired.
 *
 * Both phases run with bounded concurrency (BATCH_SIZE = 10) using
 * Promise.allSettled() to avoid:
 *   - Sequential DB round-trips timing out the Vercel Cron 60s limit
 *   - A single failure blocking the rest of the batch
 *   - Partial-delete states (workspace deleted, user not) due to timeout
 */

const BATCH_SIZE = 10;

/** Process an array of items in parallel batches of BATCH_SIZE. */
async function runInBatches<T>(
  items: T[],
  handler: (item: T) => Promise<void>
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(handler));
    for (const r of results) {
      if (r.status === "fulfilled") succeeded++;
      else failed++;
    }
  }

  return { succeeded, failed };
}

export async function runUserCleanup(): Promise<UserCleanupResult> {
  const now = new Date();

  // ── 1. Dispatch 7-day final warning emails ────────────────────────────────
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

  const { succeeded: warningsSent } = await runInBatches(
    usersForWarning.filter((u) => u.scheduledDeletion !== null),
    async (user) => {
      const cancelToken = await signCancelDeletionToken(user.id);
      const cancelUrl   = `${baseUrl}/auth/cancel-deletion?token=${encodeURIComponent(cancelToken)}`;
      await sendFinalDeletionWarningEmail({
        email: user.email,
        name: user.name,
        scheduledDeletionDate: user.scheduledDeletion!,
        cancelUrl,
      });
    }
  );

  // ── 2. Permanently purge expired accounts ─────────────────────────────────
  const expiredUsers = await prisma.user.findMany({
    where: { scheduledDeletion: { lte: now } },
    select: { id: true, email: true },
  });

  const purgedUserIds: string[] = [];

  const { failed: purgeFailures } = await runInBatches(
    expiredUsers,
    async (user) => {
      // Re-confirm scheduledDeletion is still set — guards against a concurrent
      // cancel-deletion request that arrived between the findMany and now.
      const fresh = await prisma.user.findUnique({
        where: { id: user.id },
        select: { scheduledDeletion: true },
      });
      if (!fresh?.scheduledDeletion || fresh.scheduledDeletion > now) {
        console.log(`[cron] Skipping ${user.id} — deletion cancelled or not yet due.`);
        return;
      }

      // Delete owned workspaces first so schema cascades clean up all nested
      // data (goals, milestones, tasks, documents, board items, etc.) before
      // the user row is removed.
      await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });

      purgedUserIds.push(user.id);
      console.log(`[cron] Permanently purged user ${user.email} (${user.id}).`);
    }
  );

  if (purgeFailures > 0) {
    console.error(`[cron] ${purgeFailures} user purge(s) failed — will retry on next cron run.`);
  }

  return {
    warningsSent,
    purgedCount: purgedUserIds.length,
    purgedUserIds,
  };
}
