-- =============================================================================
-- VisionBoard — Schema Drift Migration
-- =============================================================================
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard →
-- your project → SQL Editor → New query → paste & run).
--
-- This script is idempotent: every statement is wrapped in a DO block that
-- checks whether the object already exists before creating/altering it.
-- Safe to run multiple times.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
--    Add any enum values that may be missing. ALTER TYPE ... ADD VALUE is
--    also idempotent when wrapped in a check.
-- ---------------------------------------------------------------------------

-- PlanTier
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PlanTier') THEN
    CREATE TYPE "PlanTier" AS ENUM ('free', 'startup', 'growth', 'enterprise');
  END IF;
END $$;

-- MemberRole
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MemberRole') THEN
    CREATE TYPE "MemberRole" AS ENUM ('pm', 'exec', 'eng', 'marketing', 'admin');
  END IF;
END $$;
-- Add 'admin' value if the enum already exists but is missing it
DO $$ BEGIN
  ALTER TYPE "MemberRole" ADD VALUE IF NOT EXISTS 'admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GoalStatus
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoalStatus') THEN
    CREATE TYPE "GoalStatus" AS ENUM ('draft', 'active', 'completed', 'cancelled');
  END IF;
END $$;

-- MilestoneStatus
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MilestoneStatus') THEN
    CREATE TYPE "MilestoneStatus" AS ENUM ('planned', 'in_progress', 'completed', 'delayed');
  END IF;
END $$;

-- TaskStatus
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TaskStatus') THEN
    CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'in_review', 'blocked', 'done');
  END IF;
END $$;
DO $$ BEGIN ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'in_review'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'blocked';   EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Priority
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Priority') THEN
    CREATE TYPE "Priority" AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;
END $$;

-- SprintStatus (defined in schema but Sprint.status is stored as String in DB)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SprintStatus') THEN
    CREATE TYPE "SprintStatus" AS ENUM ('planned', 'active', 'completed');
  END IF;
END $$;

-- BoardEntityType
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BoardEntityType') THEN
    CREATE TYPE "BoardEntityType" AS ENUM ('goal', 'milestone', 'task', 'note');
  END IF;
END $$;

-- CommentEntityType
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CommentEntityType') THEN
    CREATE TYPE "CommentEntityType" AS ENUM ('goal', 'milestone', 'task', 'document');
  END IF;
END $$;
DO $$ BEGIN ALTER TYPE "CommentEntityType" ADD VALUE IF NOT EXISTS 'document'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AIFeature
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AIFeature') THEN
    CREATE TYPE "AIFeature" AS ENUM ('roadmap_generator', 'goal_deconstructor', 'progress_insights', 'nl_board_edit');
  END IF;
END $$;
DO $$ BEGIN ALTER TYPE "AIFeature" ADD VALUE IF NOT EXISTS 'nl_board_edit'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ---------------------------------------------------------------------------
-- 2. Task TABLE — add columns that exist in schema but not in DB
-- ---------------------------------------------------------------------------

-- blockedReason (the column causing the P2022 crash)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;

-- storyPoints
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "storyPoints" INTEGER;

-- sprintId (FK to Sprint)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "sprintId" TEXT;

-- dueDate
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Task" SET "dueDate" = CURRENT_TIMESTAMP WHERE "dueDate" IS NULL;
ALTER TABLE "Task" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "dueDate" SET DEFAULT CURRENT_TIMESTAMP;

-- description
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- order
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;

-- status — add as TEXT first if TaskStatus enum doesn't exist yet, then cast
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Task' AND column_name = 'status'
  ) THEN
    ALTER TABLE "Task" ADD COLUMN "status" "TaskStatus" NOT NULL DEFAULT 'todo';
  END IF;
END $$;

-- priority
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Task' AND column_name = 'priority'
  ) THEN
    ALTER TABLE "Task" ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'medium';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Task TABLE — add missing indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "Task_sprintId_idx"    ON "Task" ("sprintId");
CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx"  ON "Task" ("assigneeId");
CREATE INDEX IF NOT EXISTS "Task_milestoneId_idx" ON "Task" ("milestoneId");
CREATE INDEX IF NOT EXISTS "Task_status_idx"      ON "Task" ("status");


-- ---------------------------------------------------------------------------
-- 4. Task → Sprint FK (add only if sprintId column now exists and FK is missing)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Task_sprintId_fkey'
      AND table_name = 'Task'
  ) THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_sprintId_fkey"
      FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 5. Workspace TABLE — remove inviteToken if it somehow exists
--    (old schema had it; current schema does not)
-- ---------------------------------------------------------------------------

ALTER TABLE "Workspace" DROP COLUMN IF EXISTS "inviteToken";


-- ---------------------------------------------------------------------------
-- 6. Milestone TABLE — add columns that may be missing
-- ---------------------------------------------------------------------------

ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "startDate"  TIMESTAMP(3);
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "dependsOn"  TEXT[]  NOT NULL DEFAULT '{}';
ALTER TABLE "Milestone" ADD COLUMN IF NOT EXISTS "order"      INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Milestone' AND column_name = 'status'
  ) THEN
    ALTER TABLE "Milestone" ADD COLUMN "status" "MilestoneStatus" NOT NULL DEFAULT 'planned';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 7. Goal TABLE — add columns that may be missing
-- ---------------------------------------------------------------------------

ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "healthScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "ownerId"     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Goal' AND column_name = 'status'
  ) THEN
    ALTER TABLE "Goal" ADD COLUMN "status" "GoalStatus" NOT NULL DEFAULT 'draft';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Goal' AND column_name = 'keyResults'
  ) THEN
    ALTER TABLE "Goal" ADD COLUMN "keyResults" JSONB NOT NULL DEFAULT '[]';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 8. Workspace TABLE — add columns that may be missing
-- ---------------------------------------------------------------------------

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Workspace' AND column_name = 'plan'
  ) THEN
    ALTER TABLE "Workspace" ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'free';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 9. WorkspaceMember TABLE — add role column if missing
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WorkspaceMember' AND column_name = 'role'
  ) THEN
    ALTER TABLE "WorkspaceMember" ADD COLUMN "role" "MemberRole" NOT NULL DEFAULT 'pm';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 10. AIGenerationLog TABLE — create if missing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AIGenerationLog" (
  "id"            TEXT         NOT NULL,
  "workspaceId"   TEXT         NOT NULL,
  "userId"        TEXT         NOT NULL,
  "feature"       "AIFeature"  NOT NULL,
  "promptInput"   TEXT         NOT NULL,
  "modelOutput"   TEXT         NOT NULL,
  "entityCreated" TEXT,
  "tokensUsed"    INTEGER      NOT NULL DEFAULT 0,
  "accepted"      BOOLEAN,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AIGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AIGenerationLog_workspaceId_idx" ON "AIGenerationLog" ("workspaceId");
CREATE INDEX IF NOT EXISTS "AIGenerationLog_userId_idx"      ON "AIGenerationLog" ("userId");
CREATE INDEX IF NOT EXISTS "AIGenerationLog_feature_idx"     ON "AIGenerationLog" ("feature");
CREATE INDEX IF NOT EXISTS "AIGenerationLog_createdAt_idx"   ON "AIGenerationLog" ("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AIGenerationLog_workspaceId_fkey'
  ) THEN
    ALTER TABLE "AIGenerationLog"
      ADD CONSTRAINT "AIGenerationLog_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'AIGenerationLog_userId_fkey'
  ) THEN
    ALTER TABLE "AIGenerationLog"
      ADD CONSTRAINT "AIGenerationLog_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 11. WaitlistEntry TABLE — create if missing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
  "id"              TEXT         NOT NULL,
  "email"           TEXT         NOT NULL,
  "fullName"        TEXT         NOT NULL,
  "company"         TEXT,
  "teamSize"        TEXT,
  "role"            TEXT         NOT NULL,
  "painPoint"       TEXT,
  "referralCode"    TEXT         NOT NULL,
  "referredBy"      TEXT,
  "referralCount"   INTEGER      NOT NULL DEFAULT 0,
  "position"        INTEGER      NOT NULL,
  "status"          TEXT         NOT NULL DEFAULT 'PENDING', -- Values: PENDING, INVITED, REGISTERED
  "inviteToken"     TEXT,
  "invitedAt"       TIMESTAMP(3),
  "sharedPlatforms" TEXT         NOT NULL DEFAULT '',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaitlistEntry_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "WaitlistEntry_email_key"     UNIQUE ("email"),
  CONSTRAINT "WaitlistEntry_referralCode_key" UNIQUE ("referralCode"),
  CONSTRAINT "WaitlistEntry_inviteToken_key"  UNIQUE ("inviteToken")
);

CREATE INDEX IF NOT EXISTS "WaitlistEntry_email_idx"    ON "WaitlistEntry" ("email");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_status_idx"   ON "WaitlistEntry" ("status");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_position_idx" ON "WaitlistEntry" ("position");


-- ---------------------------------------------------------------------------
-- 12. WorkspaceInvite TABLE — create if missing
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "WorkspaceInvite" (
  "id"          TEXT         NOT NULL,
  "workspaceId" TEXT         NOT NULL,
  "email"       TEXT         NOT NULL,
  "role"        TEXT         NOT NULL DEFAULT 'pm',
  "token"       TEXT         NOT NULL,
  "inviterId"   TEXT         NOT NULL,
  "status"      TEXT         NOT NULL DEFAULT 'pending',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceInvite_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceInvite_token_key" UNIQUE ("token")
);

CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite" ("workspaceId");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_email_idx"       ON "WorkspaceInvite" ("email");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_token_idx"       ON "WorkspaceInvite" ("token");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'WorkspaceInvite_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceInvite"
      ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'WorkspaceInvite_inviterId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceInvite"
      ADD CONSTRAINT "WorkspaceInvite_inviterId_fkey"
      FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 13. BoardItem TABLE — add linkedTaskId if missing
-- ---------------------------------------------------------------------------

ALTER TABLE "BoardItem" ADD COLUMN IF NOT EXISTS "linkedTaskId" TEXT;


-- ---------------------------------------------------------------------------
-- 14. Document TABLE — add linked* columns if missing
-- ---------------------------------------------------------------------------

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "linkedGoalId"      TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "linkedMilestoneId" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "linkedTaskId"      TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Document' AND column_name = 'content'
  ) THEN
    ALTER TABLE "Document" ADD COLUMN "content" JSONB NOT NULL DEFAULT '{}';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 15. ActivityLog TABLE — add diff column if missing
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ActivityLog' AND column_name = 'diff'
  ) THEN
    ALTER TABLE "ActivityLog" ADD COLUMN "diff" JSONB;
  END IF;
END $$;


-- =============================================================================
-- Done. All schema drift resolved.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 16. Workspace TABLE — add storageUsedBytes for O(1) storage limit checks.
--     Replaces the previous approach of fetching all document content rows
--     and estimating total bytes in application code on every document write.
--     The column is incremented/decremented atomically in document create/delete
--     transactions.
-- ---------------------------------------------------------------------------

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "storageUsedBytes" BIGINT NOT NULL DEFAULT 0;

-- Back-fill: compute the current byte usage for existing workspaces.
-- This is a one-time scan and is idempotent (UPDATE only changes rows where
-- storageUsedBytes is still 0).
DO $$
BEGIN
  UPDATE "Workspace" w
  SET "storageUsedBytes" = sub.total
  FROM (
    SELECT "workspaceId",
           COALESCE(SUM(octet_length("content"::text)), 0) AS total
    FROM   "Document"
    GROUP  BY "workspaceId"
  ) sub
  WHERE w.id = sub."workspaceId"
    AND w."storageUsedBytes" = 0;
END $$;


-- ---------------------------------------------------------------------------
-- 17. User TABLE — add scheduledDeletion for soft-delete / 30-day retention.
--     Set when a user requests account deletion. A nightly cron job purges
--     users whose scheduledDeletion date has passed.
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "scheduledDeletion" TIMESTAMP(3);
