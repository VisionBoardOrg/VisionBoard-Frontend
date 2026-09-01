import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { PlanTier } from "@prisma/client";

export interface AuthenticatedKeyContext {
  userId: string;
  apiKeyId: string;
  userPlan: PlanTier;
  workspaceIds: string[]; // all workspace IDs the user is a member of
}

/**
 * Validates a Bearer API key from the Authorization header.
 *
 * Returns a populated AuthenticatedKeyContext on success, or null if:
 * - The header is absent or malformed
 * - The token hash doesn't match any stored key
 * - The matched key has been revoked (`revokedAt` is non-null)
 * - The matched key has expired (`expiresAt` is in the past)
 */
export async function apiKeyAuth(
  authHeader: string | null
): Promise<AuthenticatedKeyContext | null> {
  // Step 1: Parse Bearer token from header
  if (!authHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!match) return null;
  const token = match[1];

  // Step 2: Compute SHA-256 hash of the token
  const keyHash = createHash("sha256").update(token).digest("hex");

  // Step 3: Look up the key by hash
  const key = await prisma.apiKey.findFirst({
    where: { keyHash },
    include: {
      user: {
        select: { plan: true },
      },
    },
  });

  // Step 4: Not found
  if (!key) return null;

  // Step 5: Revoked
  if (key.revokedAt !== null) return null;

  // Step 6: Expired
  if (key.expiresAt !== null && key.expiresAt < new Date()) return null;

  // Step 7: Fire-and-forget lastUsedAt update — failure must never block the request
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  // Step 8: Fetch all workspace memberships for this user
  const members = await prisma.workspaceMember.findMany({
    where: { userId: key.userId },
    select: { workspaceId: true },
  });

  // Step 9: Return the authenticated context
  return {
    userId: key.userId,
    apiKeyId: key.id,
    userPlan: key.user.plan,
    workspaceIds: members.map((m) => m.workspaceId),
  };
}
