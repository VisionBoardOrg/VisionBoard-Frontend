import "server-only";
import { prisma } from "@/lib/prisma";
import { dispatchTaskAssignmentNotification } from "@/lib/notifications";

/**
 * Hard cap on the number of people assignable to a single task. Bounds both the
 * notification fan-out on writes and the growth of the card avatar stack / UI.
 */
export const MAX_TASK_ASSIGNEES = 25;

export type TaskAssigneeRole = "owner" | "contributor";

export interface AssigneeInput {
  userId: string;
  role: TaskAssigneeRole;
}

/**
 * Standard Prisma projection for task assignees. Every list/detail payload that
 * exposes task assignment must use this so the client shape never drifts.
 */
export const assigneesInclude = {
  assignees: {
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, name: true, image: true } },
    },
  },
} as const;

/** Returns the userId of every assignment whose role is `owner`. */
export function ownerIdsOf(
  assignments: Array<{ userId: string; role: string }>
): string[] {
  return assignments.filter((a) => a.role === "owner").map((a) => a.userId);
}

const ROLE_VALUES = new Set<TaskAssigneeRole>(["owner", "contributor"]);

/**
 * Validate and normalise an arbitrary `assignees` payload for a workspace.
 *
 * Rules:
 *  - undefined / null                        → []
 *  - must be an array, length ≤ MAX_TASK_ASSIGNEES
 *  - every entry needs a non-empty string userId and role ∈ {owner, contributor}
 *  - DEDUPE by userId (first wins)
 *  - a non-empty list MUST contain at least one owner
 *  - every userId MUST be a member of the workspace
 *
 * This is the single source of truth for the "≥1 owner" invariant. All write
 * paths (REST, AI board actions, MCP callers) must route through it.
 */
export async function normalizeAssignees(
  raw: unknown,
  workspaceId: string
): Promise<{ ok: true; assignees: AssigneeInput[] } | { ok: false; error: string }> {
  if (raw === undefined || raw === null) return { ok: true, assignees: [] };

  if (!Array.isArray(raw)) {
    return { ok: false, error: "assignees must be an array." };
  }
  if (raw.length > MAX_TASK_ASSIGNEES) {
    return {
      ok: false,
      error: `A task can have at most ${MAX_TASK_ASSIGNEES} assignees.`,
    };
  }

  const seen = new Set<string>();
  const assignees: AssigneeInput[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: "Each assignee must have a userId and role." };
    }
    const e = entry as Record<string, unknown>;

    if (typeof e.userId !== "string" || e.userId.trim().length === 0) {
      return { ok: false, error: "Each assignee requires a non-empty userId." };
    }
    if (typeof e.role !== "string" || !ROLE_VALUES.has(e.role as TaskAssigneeRole)) {
      return { ok: false, error: "Each assignee role must be owner or contributor." };
    }

    if (seen.has(e.userId)) continue; // dedupe — first occurrence wins
    seen.add(e.userId);
    assignees.push({ userId: e.userId, role: e.role as TaskAssigneeRole });
  }

  if (assignees.length === 0) return { ok: true, assignees: [] };

  if (!assignees.some((a) => a.role === "owner")) {
    return { ok: false, error: "At least one owner is required." };
  }

  const memberCount = await prisma.workspaceMember.count({
    where: {
      workspaceId,
      userId: { in: assignees.map((a) => a.userId) },
    },
  });
  if (memberCount !== assignees.length) {
    return { ok: false, error: "All assigned people must be members of this workspace." };
  }

  return { ok: true, assignees };
}

/**
 * Apply the full desired set of assignees to a task, diffing against the
 * existing rows. Assumes input has already been validated + normalised via
 * `normalizeAssignees`.
 *
 * Side effects:
 *  - Persists the delta in a single `$transaction`.
 *  - Dispatches an assignment notification ONLY for newly added people, and
 *    NEVER for the actor (fire-and-forget).
 */
export async function setTaskAssignments(params: {
  taskId: string;
  workspaceId: string;
  taskTitle: string;
  actorId: string;
  actorName: string;
  assignees: AssigneeInput[];
}): Promise<{ added: string[]; removed: string[]; roleChanged: string[] }> {
  const { taskId, workspaceId, taskTitle, actorId, actorName, assignees } = params;

  const existing = await prisma.taskAssignment.findMany({
    where: { taskId },
    select: { userId: true, role: true },
  });

  const existingRoleByUser = new Map(existing.map((r) => [r.userId, r.role as string]));
  const nextRoleByUser = new Map(assignees.map((a) => [a.userId, a.role as string]));

  const added = assignees
    .filter((a) => !existingRoleByUser.has(a.userId))
    .map((a) => a.userId);
  const removed = existing
    .filter((r) => !nextRoleByUser.has(r.userId))
    .map((r) => r.userId);
  const roleChanged = assignees
    .filter(
      (a) =>
        existingRoleByUser.has(a.userId) &&
        existingRoleByUser.get(a.userId) !== a.role
    )
    .map((a) => a.userId);

  const operations = [];

  if (removed.length > 0) {
    operations.push(
      prisma.taskAssignment.deleteMany({ where: { taskId, userId: { in: removed } } })
    );
  }
  if (added.length > 0) {
    operations.push(
      prisma.taskAssignment.createMany({
        data: added.map((userId) => ({
          taskId,
          userId,
          role: nextRoleByUser.get(userId) as TaskAssigneeRole,
        })),
        skipDuplicates: true,
      })
    );
  }
  for (const userId of roleChanged) {
    operations.push(
      prisma.taskAssignment.update({
        where: { taskId_userId: { taskId, userId } },
        data: { role: nextRoleByUser.get(userId) as TaskAssigneeRole },
      })
    );
  }

  await prisma.$transaction(operations);

  // Notify newly added people only — never the actor.
  for (const userId of added) {
    if (userId === actorId) continue;
    dispatchTaskAssignmentNotification({
      assigneeId: userId,
      assignerId: actorId,
      assignerName: actorName,
      taskId,
      taskTitle,
      workspaceId,
      role: nextRoleByUser.get(userId) === "contributor" ? "contributor" : "owner",
    }).catch((err) =>
      console.error("[task-assignments] Assignment notification failed:", err)
    );
  }

  return { added, removed, roleChanged };
}
