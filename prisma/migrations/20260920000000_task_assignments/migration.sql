-- Migration: task_assignments
--
-- Moves task ownership from a single scalar `Task.assigneeId` to a many-to-many
-- `TaskAssignment` join table with per-person roles (owner | contributor).
--
-- IDEMPOTENT — safe to re-run. Steps:
--   1. Create the TaskAssigneeRole enum (guarded).
--   2. Create the TaskAssignment table (IF NOT EXISTS).
--   3. Create the unique + secondary indexes (IF NOT EXISTS).
--   4. Create the foreign keys (guarded).
--   5. Backfill every existing non-null Task.assigneeId into a TaskAssignment
--      row with role='owner' — BEFORE the column is dropped (guarded so a
--      second run, after the column is gone, is a no-op).
--   6. Drop the legacy Task.assigneeId column (IF EXISTS).
--
-- No data loss: each legacy single assignee becomes exactly one owner row.

-- 1. Enum ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskAssigneeRole') THEN
        CREATE TYPE "TaskAssigneeRole" AS ENUM ('owner', 'contributor');
    END IF;
END $$;

-- 2. Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TaskAssignment" (
    "id"        TEXT               NOT NULL,
    "taskId"    TEXT               NOT NULL,
    "userId"    TEXT               NOT NULL,
    "role"      "TaskAssigneeRole" NOT NULL DEFAULT 'contributor',
    "createdAt" TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- 3. Indexes ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "TaskAssignment_taskId_userId_key"
    ON "TaskAssignment"("taskId", "userId");

CREATE INDEX IF NOT EXISTS "TaskAssignment_userId_role_idx"
    ON "TaskAssignment"("userId", "role");

CREATE INDEX IF NOT EXISTS "TaskAssignment_taskId_role_idx"
    ON "TaskAssignment"("taskId", "role");

-- 4. Foreign keys ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_taskId_fkey') THEN
        ALTER TABLE "TaskAssignment"
            ADD CONSTRAINT "TaskAssignment_taskId_fkey"
            FOREIGN KEY ("taskId") REFERENCES "Task"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TaskAssignment_userId_fkey') THEN
        ALTER TABLE "TaskAssignment"
            ADD CONSTRAINT "TaskAssignment_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 5. Backfill legacy single assignees as owners ───────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Task' AND column_name = 'assigneeId'
    ) THEN
        INSERT INTO "TaskAssignment" ("id", "taskId", "userId", "role", "createdAt")
        SELECT gen_random_uuid()::text, t."id", t."assigneeId", 'owner', CURRENT_TIMESTAMP
        FROM "Task" t
        WHERE t."assigneeId" IS NOT NULL
        ON CONFLICT ("taskId", "userId") DO NOTHING;
    END IF;
END $$;

-- 6. Drop the legacy scalar column ───────────────────────────────────────────
ALTER TABLE "Task" DROP COLUMN IF EXISTS "assigneeId";
