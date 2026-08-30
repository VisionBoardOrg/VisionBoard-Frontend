/**
 * lib/auth/require-role.ts — Centralized RBAC enforcement helper.
 *
 * SECURITY (LOW-7): Authorization logic was previously duplicated across every
 * API route as ad-hoc `if (!member || member.role !== "admin")` checks. Drift
 * between those copies was the root cause of several findings in the audit
 * (CRITICAL-4, HIGH-6, MEDIUM-1). This module provides a single enforcer so
 * every route that gates on role uses identical, reviewed logic.
 *
 * Usage — inside any API route handler:
 *
 *   const check = await requireRole(session.user.id, workspaceId, ["admin", "owner"]);
 *   if (!check.ok) return check.response;
 *   // check.member and check.isOwner are now available
 *
 * Role hierarchy (weakest → strongest):
 *   eng < marketing < exec < pm < admin < owner
 *
 * "owner" is not a MemberRole enum value — it is derived by comparing
 * WorkspaceMember.workspaceId's ownerId to the requesting userId.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { MemberRole } from "@prisma/client";

// Canonical role ordering used for "at least" comparisons.
const ROLE_RANK: Record<MemberRole, number> = {
  eng:       0,
  marketing: 1,
  exec:      2,
  pm:        3,
  admin:     4,
};

export type RoleOrOwner = MemberRole | "owner";

export interface RoleCheckOk {
  ok: true;
  isOwner: boolean;
  member: {
    id: string;
    role: MemberRole;
    workspaceId: string;
    userId: string;
  };
}

export interface RoleCheckFail {
  ok: false;
  /** Ready-to-return NextResponse with the appropriate 401 / 403 status. */
  response: ReturnType<typeof NextResponse.json>;
}

export type RoleCheckResult = RoleCheckOk | RoleCheckFail;

/**
 * Verify that `userId` is a member of `workspaceId` and holds one of the
 * `requiredRoles`. Pass `"owner"` to require workspace ownership.
 *
 * Returns `{ ok: true, member, isOwner }` on success so callers can access
 * membership data without an additional DB query.
 *
 * Returns `{ ok: false, response }` on failure. The response is a 401 when
 * the user has no session and a 403 when they lack the required role.
 *
 * @param userId        - session.user.id from the route handler
 * @param workspaceId   - workspaceId from the request params or body
 * @param requiredRoles - one or more roles that are sufficient for access.
 *                        If multiple are passed, ANY match grants access.
 *                        Pass ["owner"] to restrict to the workspace owner only.
 */
export async function requireRole(
  userId: string,
  workspaceId: string,
  requiredRoles: RoleOrOwner[]
): Promise<RoleCheckResult> {
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: {
      id: true,
      role: true,
      workspaceId: true,
      userId: true,
      workspace: { select: { ownerId: true } },
    },
  });

  if (!member) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Workspace not found or access denied." }, { status: 403 }),
    };
  }

  const isOwner = member.workspace.ownerId === userId;

  // Check whether the caller satisfies any of the required roles.
  const allowed = requiredRoles.some((required) => {
    if (required === "owner") return isOwner;
    if (isOwner) return true; // owner always satisfies any role requirement
    return member.role === required;
  });

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "You do not have the required role to perform this action." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    isOwner,
    member: {
      id: member.id,
      role: member.role,
      workspaceId: member.workspaceId,
      userId: member.userId,
    },
  };
}

/**
 * Convenience: require the caller to be the workspace owner or an admin.
 * This is the most common guard pattern (workspace rename, export, transfers).
 */
export function requireAdminOrOwner(
  userId: string,
  workspaceId: string
): Promise<RoleCheckResult> {
  return requireRole(userId, workspaceId, ["admin", "owner"]);
}

/**
 * Convenience: require the caller to hold at least the given role rank.
 * E.g. requireAtLeastRole(uid, wsId, "pm") allows pm, admin, and owner.
 */
export function requireAtLeastRole(
  userId: string,
  workspaceId: string,
  minimumRole: MemberRole
): Promise<RoleCheckResult> {
  const minRank = ROLE_RANK[minimumRole];
  const qualifying = (Object.keys(ROLE_RANK) as MemberRole[]).filter(
    (r) => ROLE_RANK[r] >= minRank
  );
  return requireRole(userId, workspaceId, [...qualifying, "owner"]);
}
