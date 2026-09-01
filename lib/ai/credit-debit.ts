import "server-only";

import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/plan-limits";

/**
 * Atomically debit one AI credit from a user's monthly allowance.
 *
 * Returns:
 *   "debited"   — credit successfully decremented (CAS succeeded)
 *   "unlimited" — user is on an unlimited plan; counter incremented for audit only
 *   "exceeded"  — user is at or over their credit limit (CAS found no rows to update)
 *
 * Mirrors the atomic updateMany WHERE aiCreditsUsed < creditLimit pattern used
 * in the web AI routes (e.g. app/api/ai/copilot/chat/route.ts).
 */
export async function debitCredit(
  userId: string
): Promise<"debited" | "unlimited" | "exceeded"> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, aiCreditsUsed: true },
  });

  // Safe default: treat a missing user as exceeded to prevent credit leakage.
  if (!user) {
    return "exceeded";
  }

  const creditLimit = PLAN_LIMITS[user.plan].aiCreditsPerMonth;

  if (creditLimit === null) {
    // Unlimited plan — still increment for audit tracking purposes.
    await prisma.user.update({
      where: { id: userId },
      data: { aiCreditsUsed: { increment: 1 } },
    });
    return "unlimited";
  }

  // Atomic compare-and-swap: only increment if still under the limit.
  // Using updateMany so we get a count back without a separate SELECT.
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      aiCreditsUsed: { lt: creditLimit },
    },
    data: { aiCreditsUsed: { increment: 1 } },
  });

  if (result.count === 0) {
    // CAS failed — user is at or beyond their limit.
    return "exceeded";
  }

  return "debited";
}

/**
 * Refund one AI credit to a user after a failed or empty LLM response.
 *
 * The WHERE aiCreditsUsed > 0 guard prevents the counter from going negative
 * in the rare case of a double-refund or a race condition.
 *
 * This function is fire-and-forget safe: all errors are swallowed so that a
 * transient DB failure during a refund never surfaces to the caller.
 */
export async function refundCredit(userId: string): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: {
        id: userId,
        aiCreditsUsed: { gt: 0 },
      },
      data: { aiCreditsUsed: { decrement: 1 } },
    });
  } catch {
    // Intentionally swallowed — refund failures must not block the caller.
  }
}
