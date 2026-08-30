-- =============================================================================
-- VisionBoard — pgvector ANN Index Migration
-- =============================================================================
-- Run in the Supabase SQL Editor (same workflow as apply_schema_drift.sql).
-- Idempotent: safe to run multiple times.
--
-- WHY: the RAG layer previously stored embeddings as DOUBLE PRECISION[]
-- ("embedding" column) and ranked every workspace chunk in JavaScript on every
-- copilot query — O(N_chunks × 1536) CPU and tens of MB of DB egress per
-- request. This migration adds a native `vector(1536)` column maintained by
-- the indexer (lib/ai/indexer.ts) and backfilled from the legacy column, plus
-- an HNSW cosine index so searchWorkspaceKnowledge can push ranking down to
-- the database as `ORDER BY "embeddingVec" <=> $query LIMIT k`.
--
-- The legacy "embedding" Float[] column is kept as the Prisma-writable source
-- of truth; "embeddingVec" is a derived, SQL-maintained search column and is
-- intentionally NOT in schema.prisma (Unsupported type).
-- =============================================================================

-- 1. Ensure the extension exists (it was already enabled by the drift file;
--    IF NOT EXISTS keeps this runnable on fresh databases).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the native vector column (1536 = text-embedding-3-small / EMBEDDING_DIM).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'WorkspaceEmbedding' AND column_name = 'embeddingVec'
  ) THEN
    ALTER TABLE "WorkspaceEmbedding" ADD COLUMN "embeddingVec" vector(1536);
  END IF;
END $$;

-- 3. Backfill from the legacy float[] column.
--    Postgres renders double precision[] as '{1,2,3}' — rebuild it as '[1,2,3]'
--    text and cast to vector. Only rows with the full 1536 dims qualify.
UPDATE "WorkspaceEmbedding"
SET "embeddingVec" = ('[' || array_to_string("embedding", ',') || ']')::vector
WHERE "embeddingVec" IS NULL
  AND cardinality("embedding") = 1536;

-- 4. HNSW index for cosine distance (used by ORDER BY ... <=> ... queries).
--    NOTE: builds with a SHARE lock; on very large embedding tables run during
--    low-traffic hours, or swap to CREATE INDEX CONCURRENTLY in a non-transactional session.
CREATE INDEX IF NOT EXISTS "WorkspaceEmbedding_embeddingVec_hnsw"
  ON "WorkspaceEmbedding" USING hnsw ("embeddingVec" vector_cosine_ops);
