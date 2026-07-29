import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { WaitlistJoinInput } from "../validations/waitlist-schemas";
import { WaitlistEntry } from "@prisma/client";

// Export WaitlistRecord as an alias to the Prisma WaitlistEntry model
// to ensure seamless integration with the rest of the application.
export type WaitlistRecord = WaitlistEntry;

/** Generates a referral code like "ALEX992" from the user's name. */
function generateReferralCode(name: string): string {
  const cleanName = name.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4) || "WAIT";
  const num = Math.floor(100 + Math.random() * 900);
  return `${cleanName}${num}`;
}

/**
 * Generates a cryptographically secure random token.
 * Uses Node.js crypto.randomBytes — NOT Math.random().
 */
function generateSecureToken(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

/**
 * Returns the configured VIP access code from the environment.
 * Falls back to the legacy hardcoded value in non-production environments
 * only, and always warns if using the fallback.
 */
function getVipCode(): string {
  const envCode = process.env.VIP_ACCESS_CODE;
  if (envCode && envCode.trim()) return envCode.trim().toUpperCase();

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[waitlist] VIP_ACCESS_CODE env var is not set. Using dev fallback. " +
        "Set VIP_ACCESS_CODE in production."
    );
    return "VISIONBOARD2026VIP";
  }

  // In production, if VIP_ACCESS_CODE is unset, disable VIP bypass entirely
  return "";
}

export async function getTotalWaitlistCount(): Promise<number> {
  return prisma.waitlistEntry.count();
}

export async function getWaitlistByEmail(email: string): Promise<WaitlistRecord | undefined> {
  const target = email.toLowerCase().trim();
  const entry = await prisma.waitlistEntry.findUnique({
    where: { email: target },
  });
  return entry || undefined;
}

export async function getAllWaitlistEntries(): Promise<WaitlistRecord[]> {
  return prisma.waitlistEntry.findMany({
    orderBy: { position: "asc" },
  });
}

export async function joinWaitlist(input: WaitlistJoinInput): Promise<{
  record: WaitlistRecord;
  isNew: boolean;
  vipBypass: boolean;
}> {
  const emailNorm = input.email.toLowerCase().trim();

  const existing = await prisma.waitlistEntry.findUnique({
    where: { email: emailNorm },
  });
  if (existing) {
    return { record: existing, isNew: false, vipBypass: existing.status === "INVITED" };
  }

  // Check VIP Access Code against environment-controlled value
  const validVipCode = getVipCode();
  const isVip = Boolean(
    validVipCode &&
      input.vipCode &&
      input.vipCode.trim().toUpperCase() === validVipCode
  );

  // Wrap position calculation + insert in a transaction to prevent race conditions
  const newRecord = await prisma.$transaction(async (tx) => {
    // Use MAX(position) so new users always get a unique slot beyond all existing entries.
    // COUNT-based approach caused duplicates when referral boosts shifted multiple users
    // to the same position concurrently.
    const maxPositionAgg = await tx.waitlistEntry.aggregate({
      _max: { position: true },
    });
    const currentMax = maxPositionAgg._max.position ?? 0;
    let position = currentMax + 1;

    // Position boost if referred by another user
    if (input.referredBy && input.referredBy.trim()) {
      const refCodeClean = input.referredBy.trim().toUpperCase();
      const referrerRecord = await tx.waitlistEntry.findUnique({
        where: { referralCode: refCodeClean },
      });

      // Move new user up by 5 spots (min position 1)
      const desiredNewPosition = Math.max(1, position - 5);

      // Shift any existing entries at or between desiredNewPosition and position
      // downward by 1 to keep positions unique
      await tx.waitlistEntry.updateMany({
        where: {
          position: { gte: desiredNewPosition, lt: position },
        },
        data: { position: { increment: 1 } },
      });

      position = desiredNewPosition;

      if (referrerRecord) {
        // Re-fetch referrer in case their position was just shifted
        const freshReferrer = await tx.waitlistEntry.findUnique({
          where: { id: referrerRecord.id },
        });
        if (freshReferrer) {
          const desiredReferrerPosition = Math.max(1, freshReferrer.position - 5);
          // Shift entries between the desired spot and current referrer position
          await tx.waitlistEntry.updateMany({
            where: {
              id: { not: freshReferrer.id },
              position: { gte: desiredReferrerPosition, lt: freshReferrer.position },
            },
            data: { position: { increment: 1 } },
          });
          await tx.waitlistEntry.update({
            where: { id: freshReferrer.id },
            data: {
              referralCount: freshReferrer.referralCount + 1,
              position: desiredReferrerPosition,
            },
          });
        }
      }
    }

    // If VIP code used, place at the very top (position 1), shifting everyone else
    if (isVip) {
      const desiredVipPosition = 1;
      if (position > desiredVipPosition) {
        await tx.waitlistEntry.updateMany({
          where: { position: { gte: desiredVipPosition, lt: position } },
          data: { position: { increment: 1 } },
        });
        position = desiredVipPosition;
      }
    }

    const referralCode = generateReferralCode(input.fullName);

    return tx.waitlistEntry.create({
      data: {
        email: emailNorm,
        fullName: input.fullName,
        company: input.company,
        teamSize: input.teamSize,
        role: input.role,
        painPoint: input.painPoint,
        referralCode,
        referredBy: input.referredBy,
        referralCount: 0,
        position,
        status: isVip ? "INVITED" : "PENDING",
        // Use cryptographically secure random token for VIP bypass
        inviteToken: isVip ? generateSecureToken("vip_tok") : undefined,
      },
    });
  });

  return { record: newRecord, isNew: true, vipBypass: isVip };
}

/**
 * Bumps the user's waitlist position by 2 when they share on a social platform.
 * Each platform can only be used once per user to prevent abuse.
 * Returns null if the platform was already used, or if the user is not found.
 */
export async function bumpPositionByShare(
  email: string,
  shareType: "linkedin" | "twitter" | "email"
): Promise<WaitlistRecord | null> {
  const target = email.toLowerCase().trim();
  const record = await prisma.waitlistEntry.findUnique({
    where: { email: target },
  });

  if (!record) return null;

  // Deduplication: check if this platform was already used
  const alreadyShared = (record.sharedPlatforms || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .includes(shareType);

  if (alreadyShared) {
    // Return the current record without any changes
    return record;
  }

  const updatedPlatforms = record.sharedPlatforms
    ? `${record.sharedPlatforms},${shareType}`
    : shareType;

  // Gain 2 spots for sharing (once per platform) — shift colliding entries first
  const desiredPosition = Math.max(1, record.position - 2);
  if (desiredPosition < record.position) {
    await prisma.waitlistEntry.updateMany({
      where: {
        id: { not: record.id },
        position: { gte: desiredPosition, lt: record.position },
      },
      data: { position: { increment: 1 } },
    });
  }
  const updated = await prisma.waitlistEntry.update({
    where: { id: record.id },
    data: {
      position: desiredPosition,
      sharedPlatforms: updatedPlatforms,
    },
  });

  return updated;
}

export function validateVipCode(code: string): boolean {
  const validCode = getVipCode();
  return Boolean(validCode && code.trim().toUpperCase() === validCode);
}

export async function dispatchInvites(ids: string[]): Promise<WaitlistRecord[]> {
  if (!ids || ids.length === 0) return [];

  // Bulk update all PENDING records matching input IDs in a single query
  await prisma.waitlistEntry.updateMany({
    where: {
      id: { in: ids },
      status: "PENDING",
    },
    data: {
      status: "INVITED",
      invitedAt: new Date(),
    },
  });

  // Fetch all invited records matching input IDs to assign unique invite tokens and return
  const entries = await prisma.waitlistEntry.findMany({
    where: {
      id: { in: ids },
      status: "INVITED",
    },
  });

  // Assign cryptographically secure invite tokens to entries missing a token
  const entriesToTokenize = entries.filter((e) => !e.inviteToken);
  if (entriesToTokenize.length > 0) {
    const tokenized = await prisma.$transaction(
      entriesToTokenize.map((entry) =>
        prisma.waitlistEntry.update({
          where: { id: entry.id },
          data: {
            inviteToken: generateSecureToken("tok_magic"),
          },
        })
      )
    );
    const tokenizedMap = new Map(tokenized.map((e) => [e.id, e]));
    return entries.map((e) => tokenizedMap.get(e.id) || e);
  }

  return entries;
}

/**
 * Deletes waitlist entries by ID.
 * Returns the count of deleted records.
 */
export async function deleteWaitlistEntries(ids: string[]): Promise<number> {
  const result = await prisma.waitlistEntry.deleteMany({
    where: { id: { in: ids } },
  });
  // After deleting, reindex remaining entries to eliminate gaps.
  await normalizePositions();
  return result.count;
}

/**
 * Re-assigns sequential positions (1, 2, 3...) to all entries ordered by their
 * current position. Run after any bulk delete to remove gaps.
 */
export async function normalizePositions(): Promise<void> {
  const entries = await prisma.waitlistEntry.findMany({
    orderBy: { position: "asc" },
    select: { id: true },
  });
  for (let i = 0; i < entries.length; i++) {
    await prisma.waitlistEntry.update({
      where: { id: entries[i].id },
      data: { position: i + 1 },
    });
  }
}
