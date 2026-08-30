-- Migration: remove_sprints
-- Drops the Sprint table, removes sprintId from Task, and drops related indexes.

-- 1. Nullify sprintId on all tasks before dropping the column
UPDATE "Task" SET "sprintId" = NULL WHERE "sprintId" IS NOT NULL;

-- 2. Drop indexes on Task.sprintId
DROP INDEX IF EXISTS "Task_sprintId_idx";
DROP INDEX IF EXISTS "Task_sprintId_status_idx";

-- 3. Drop the foreign key constraint and column
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_sprintId_fkey";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "sprintId";

-- 4. Drop the Sprint table
DROP TABLE IF EXISTS "Sprint";
