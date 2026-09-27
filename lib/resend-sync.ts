import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

export const RESEND_SEGMENTS = {
  GENERAL: "2277c559-95c7-40f4-abfe-c26f2189e50f",
  FREE_TIER: "94e018a8-076b-4038-80f3-9fe736c175fc",
  PAYING_CUSTOMERS: "8e01fb26-f820-445f-bb47-22f47a65fd4e",
} as const;

export interface UserProperties {
  plan?: string;
  role?: "owner" | "member";
  stage?: "new" | "active" | "unverified";
  verification_status?: "verified" | "unverified";
  ai_credits_used?: number;
}

export interface SyncUserInput {
  id?: string;
  email: string;
  name?: string | null;
  unsubscribed?: boolean;
  properties?: UserProperties;
}

export interface SyncResult {
  success: boolean;
  contactId?: string;
  error?: string;
  skipped?: boolean;
}

export interface BatchSyncSummary {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  errors: Array<{ email: string; error: string }>;
}

let cachedAudienceId: string | null = null;

/**
 * Resolves the Resend Audience ID:
 * 1. Checks process.env.RESEND_AUDIENCE_ID
 * 2. If not set, queries Resend API for available audiences and caches the first one
 */
export async function getResendAudienceId(resendClient?: Resend): Promise<string | null> {
  if (process.env.RESEND_AUDIENCE_ID && process.env.RESEND_AUDIENCE_ID.trim()) {
    return process.env.RESEND_AUDIENCE_ID.trim();
  }

  if (cachedAudienceId) {
    return cachedAudienceId;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const client = resendClient ?? new Resend(apiKey);
    const response = await client.audiences.list();
    if (response.data?.data && response.data.data.length > 0) {
      cachedAudienceId = response.data.data[0].id;
      return cachedAudienceId;
    }
  } catch (err) {
    console.error("[resend-sync] Failed to auto-resolve Resend Audience ID:", err);
  }

  return null;
}

/**
 * Validates basic email formatting
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 255;
}

/**
 * Parses user name into firstName and lastName for Resend contact fields.
 * Sanitizes unusual characters / HTML tags.
 */
export function parseName(name?: string | null): { firstName?: string; lastName?: string } {
  if (!name || typeof name !== "string") return {};

  // Strip script tags with content, then any remaining HTML tags
  const cleaned = name
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .trim();
  if (!cleaned) return {};

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) {
    return { firstName: parts[0].slice(0, 50) };
  }

  return {
    firstName: parts[0].slice(0, 50),
    lastName: parts.slice(1).join(" ").slice(0, 50),
  };
}

/**
 * Computes segmentation metadata attributes for a user based on DB records.
 */
export function computeUserProperties(user: {
  plan?: string | null;
  createdAt?: Date | string | null;
  emailVerified?: Date | string | null;
  aiCreditsUsed?: number | null;
  isOwner?: boolean;
  _count?: { ownedWorkspaces?: number };
}): UserProperties {
  const plan = user.plan || "free";
  const isOwner = user.isOwner ?? ((user._count?.ownedWorkspaces ?? 0) > 0);
  const isVerified = Boolean(user.emailVerified);
  const createdTime = user.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const isNew = Date.now() - createdTime <= 14 * 24 * 60 * 60 * 1000;

  const stage = !isVerified ? "unverified" : isNew ? "new" : "active";

  return {
    plan,
    role: isOwner ? "owner" : "member",
    stage,
    verification_status: isVerified ? "verified" : "unverified",
    ai_credits_used: Number(user.aiCreditsUsed || 0),
  };
}

/**
 * Synchronizes an individual user to Resend Contacts with rich properties
 * and segment placement. Safe to call in background promises (never throws).
 */
export async function syncUserToResend(user: SyncUserInput): Promise<SyncResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY is not configured", skipped: true };
  }

  const email = user.email?.trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return { success: false, error: `Invalid email address: ${user.email}`, skipped: true };
  }

  try {
    const resend = new Resend(apiKey);
    const audienceId = (await getResendAudienceId(resend)) || RESEND_SEGMENTS.GENERAL;

    const { firstName, lastName } = parseName(user.name);

    const properties: Record<string, string | number> = {
      plan: user.properties?.plan || "free",
      role: user.properties?.role || "member",
      stage: user.properties?.stage || "active",
      verification_status: user.properties?.verification_status || "unverified",
      ai_credits_used: Number(user.properties?.ai_credits_used ?? 0),
    };

    const createPayload: {
      email: string;
      firstName?: string;
      lastName?: string;
      unsubscribed?: boolean;
      audienceId?: string;
      properties?: Record<string, string | number>;
    } = {
      email,
      unsubscribed: user.unsubscribed ?? false,
      audienceId,
      properties,
    };

    if (firstName) createPayload.firstName = firstName;
    if (lastName) createPayload.lastName = lastName;

    const res = await resend.contacts.create(createPayload);
    let contactId = res.data?.id;

    // In Resend, creating an existing contact returns 200 without updating existing properties.
    // Call update to ensure all segmentation properties and names are refreshed!
    const updateRes = await resend.contacts.update(createPayload);
    if (updateRes.data?.id) {
      contactId = updateRes.data.id;
    }

    // Also sync to plan segment (Free Tier or Paying Customers)
    const planSegmentId =
      user.properties?.plan && user.properties.plan !== "free"
        ? RESEND_SEGMENTS.PAYING_CUSTOMERS
        : RESEND_SEGMENTS.FREE_TIER;

    if (planSegmentId && planSegmentId !== audienceId) {
      try {
        const segPayload = { ...createPayload, audienceId: planSegmentId };
        await resend.contacts.create(segPayload).catch(() => {});
        await resend.contacts.update(segPayload).catch(() => {});
      } catch (err) {
        // Non-critical if secondary segment fails
      }
    }

    return { success: true, contactId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[resend-sync] Unexpected error syncing ${email} to Resend:`, message);
    return { success: false, error: message };
  }
}

/**
 * Removes a user's contact from Resend across all audiences/segments when purged.
 */
export async function removeUserFromResend(email: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || !isValidEmail(email)) return false;

  try {
    const resend = new Resend(apiKey);
    const audienceId = await getResendAudienceId(resend);

    const audiences = [
      audienceId,
      RESEND_SEGMENTS.GENERAL,
      RESEND_SEGMENTS.FREE_TIER,
      RESEND_SEGMENTS.PAYING_CUSTOMERS,
    ].filter(Boolean) as string[];

    const uniqueAudiences = Array.from(new Set(audiences));

    await Promise.allSettled(
      uniqueAudiences.map((audId) => resend.contacts.remove({ email, audienceId: audId }))
    );

    return true;
  } catch (error) {
    console.error(`[resend-sync] Failed to remove ${email} from Resend:`, error);
    return false;
  }
}

/**
 * Syncs all active Supabase users to Resend with rich properties and segments.
 * Runs in batches of 4 with a delay between batches to stay under the 10 req/s rate limit.
 */
export async function syncAllUsersFromDatabase(): Promise<BatchSyncSummary> {
  const users = await prisma.user.findMany({
    where: {
      scheduledDeletion: null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      emailVerified: true,
      aiCreditsUsed: true,
      createdAt: true,
      _count: {
        select: {
          ownedWorkspaces: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const summary: BatchSyncSummary = {
    total: users.length,
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const CHUNK_SIZE = 4;
  const DELAY_BETWEEN_CHUNKS_MS = 500;

  for (let i = 0; i < users.length; i += CHUNK_SIZE) {
    const chunk = users.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map((user) => {
        const properties = computeUserProperties(user);
        return syncUserToResend({
          id: user.id,
          email: user.email,
          name: user.name,
          properties,
        });
      })
    );

    results.forEach((res, index) => {
      const email = chunk[index].email;
      if (res.success) {
        summary.synced++;
      } else if (res.skipped) {
        summary.skipped++;
      } else {
        summary.failed++;
        summary.errors.push({ email, error: res.error || "Unknown error" });
      }
    });

    if (i + CHUNK_SIZE < users.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
    }
  }

  return summary;
}
