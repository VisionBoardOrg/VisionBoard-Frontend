-- Migration: token_key_hashes_and_apikey_expiry
--
-- Applies schema changes from commit f98053eef0 (SECURITY HIGH-7 & MEDIUM-9):
--   1. VerificationToken.keyHash (TEXT, UNIQUE + INDEX)
--   2. WorkspaceInvite.keyHash (TEXT, UNIQUE + INDEX)
--   3. NotificationPreference.keyHash (TEXT, UNIQUE + INDEX)
--   4. ApiKey.keyPrefix (extend VARCHAR(12) -> VARCHAR(20)) and ApiKey.keySuffix (VARCHAR(4) NOT NULL DEFAULT '')
--   5. Backfill NULL ApiKey.expiresAt rows to createdAt + 90 days and enforce NOT NULL
--
-- IDEMPOTENT — safe to re-run.

-- 1. VerificationToken.keyHash
ALTER TABLE "VerificationToken" ADD COLUMN IF NOT EXISTS "keyHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_keyHash_key" ON "VerificationToken"("keyHash");
CREATE INDEX IF NOT EXISTS "VerificationToken_keyHash_idx" ON "VerificationToken"("keyHash");

-- 2. WorkspaceInvite.keyHash
ALTER TABLE "WorkspaceInvite" ADD COLUMN IF NOT EXISTS "keyHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvite_keyHash_key" ON "WorkspaceInvite"("keyHash");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_keyHash_idx" ON "WorkspaceInvite"("keyHash");

-- 3. NotificationPreference.keyHash
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "keyHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_keyHash_key" ON "NotificationPreference"("keyHash");
CREATE INDEX IF NOT EXISTS "NotificationPreference_keyHash_idx" ON "NotificationPreference"("keyHash");

-- 4. ApiKey.keyPrefix & ApiKey.keySuffix
ALTER TABLE "ApiKey" ALTER COLUMN "keyPrefix" TYPE VARCHAR(20);
ALTER TABLE "ApiKey" ADD COLUMN IF NOT EXISTS "keySuffix" VARCHAR(4) NOT NULL DEFAULT '';

-- 5. ApiKey.expiresAt backfill & NOT NULL constraint
UPDATE "ApiKey"
SET "expiresAt" = COALESCE("createdAt", CURRENT_TIMESTAMP) + INTERVAL '90 days'
WHERE "expiresAt" IS NULL;

ALTER TABLE "ApiKey" ALTER COLUMN "expiresAt" SET NOT NULL;
