-- =============================================================================
-- VisionBoard — Perf Migration: Task.workspaceId denormalization + index tuning
-- =============================================================================
-- Run in the Supabase SQL Editor, same as apply_schema_drift.sql.
--
-- Follows the same conventions: every statement is idempotent and safe to
-- run multiple times.
--
-- Contents (applied in safe order):
--   1. Task.workspaceId: add column → backfill → NOT NULL → FK → index
--   2. Missing indexes: Task(status, dueDate), Notification(entityId, createdAt),
--      Notification(userId, createdAt), User(scheduledDeletion)
--   3. Drop redundant indexes: Notification(userId), Notification(userId, read),
--      WorkspaceInvite(token), WorkspaceEmbedding(entityId)
--   4. Goal.ownerId: clean dangling values → FK to User(id) ON DELETE SET NULL
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1a. Task.workspaceId — denormalized from Milestone→Goal so workspace-scoped
--     task queries don't need a join.
--
--     Task.milestoneId is NOT NULL in the schema, Milestone.goalId is NOT NULL,
--     and Goal.workspaceId is NOT NULL, so the backfill below covers every
--     non-orphan row (verified against prisma/schema.prisma).
-- ---------------------------------------------------------------------------
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

-- 1b. Backfill via the milestone → goal chain.
UPDATE "Task" t
SET "workspaceId" = g."workspaceId"
FROM "Milestone" m
JOIN "Goal" g ON m."goalId" = g."id"
WHERE t."milestoneId" = m."id"
  AND t."workspaceId" IS NULL;

-- 1c. Safety net for orphaned rows: any Task still NULL here points at a
--     milestone/goal that no longer exists, i.e. it already violates the
--     NOT NULL milestoneId + FK chain. These must be removed before the
--     column can be set NOT NULL; on a healthy database this deletes nothing.
DELETE FROM "Task" WHERE "workspaceId" IS NULL;

-- 1d. Make the column required (schema declares workspaceId as non-nullable).
ALTER TABLE "Task" ALTER COLUMN "workspaceId" SET NOT NULL;

-- 1e. FK to Workspace with cascade — matches every other workspaceId FK in
--     the schema (Document, BoardItem, Sprint, …).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Task_workspaceId_fkey'
      AND table_name = 'Task'
  ) THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 1f. Index for workspace-scoped task lookups.
CREATE INDEX IF NOT EXISTS "Task_workspaceId_idx" ON "Task" ("workspaceId");


-- ---------------------------------------------------------------------------
-- 2. Missing indexes for hot query paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Task_status_dueDate_idx" ON "Task" ("status", "dueDate");
CREATE INDEX IF NOT EXISTS "Notification_entityId_createdAt_idx" ON "Notification" ("entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "User_scheduledDeletion_idx" ON "User" ("scheduledDeletion");


-- ---------------------------------------------------------------------------
-- 3. Drop redundant indexes
--    - Notification(userId) and Notification(userId, read) are left-prefix
--      subsets of Notification(userId, read, createdAt)
--    - WorkspaceInvite(token) duplicates the UNIQUE constraint's index
--      (WorkspaceInvite_token_key)
--    - WorkspaceEmbedding(entityId) is subsumed by the composite
--      (workspaceId, entityId); lookups are always workspace-scoped
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "Notification_userId_idx";
DROP INDEX IF EXISTS "Notification_userId_read_idx";
DROP INDEX IF EXISTS "WorkspaceInvite_token_idx";
DROP INDEX IF EXISTS "WorkspaceEmbedding_entityId_idx";


-- ---------------------------------------------------------------------------
-- 4. Goal.ownerId — enforce referential integrity to User.
--    ownerId stays NULLABLE (a goal may have no owner); deleting the owner
--    user sets it to NULL rather than cascading.
-- ---------------------------------------------------------------------------

-- 4a. Null out dangling ownerId values so the FK can be added.
UPDATE "Goal"
SET "ownerId" = NULL
WHERE "ownerId" IS NOT NULL
  AND "ownerId" NOT IN (SELECT "id" FROM "User");

-- 4b. ownerId was added as nullable TEXT in apply_schema_drift.sql §7 and is
--     String? in the schema; DROP NOT NULL is a defensive no-op for any
--     database where the column was created NOT NULL.
ALTER TABLE "Goal" ALTER COLUMN "ownerId" DROP NOT NULL;

-- 4c. FK constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Goal_ownerId_fkey'
      AND table_name = 'Goal'
  ) THEN
    ALTER TABLE "Goal"
      ADD CONSTRAINT "Goal_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- =============================================================================
-- Done.
-- =============================================================================
