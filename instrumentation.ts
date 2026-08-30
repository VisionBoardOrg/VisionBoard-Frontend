/**
 * instrumentation.ts — Next.js server instrumentation hook.
 *
 * Automatically loaded by Next.js before the application starts serving
 * requests (Node.js runtime only).
 *
 * Runs startup validation checks:
 *  1. Environment variable validation (required secrets).
 *  2. pgvector migration health check — warns if the `embeddingVec` column
 *     is missing so semantic search degradation is explicit, not silent.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in the Node.js server runtime, not in Edge or during builds
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/validate-env");
    validateEnv();

    // ── F-14: pgvector column health check ───────────────────────────────
    // The semantic search fast path (ANN via pgvector HNSW index) requires
    // the `embeddingVec` column created by apply_vector_embeddings.sql.
    // If absent, every copilot search falls back to a full JavaScript
    // cosine-similarity scan over up to 2 000 rows — much slower at scale.
    try {
      const { prisma } = await import("./lib/prisma");
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) AS count
        FROM information_schema.columns
        WHERE table_name = 'WorkspaceEmbedding'
          AND column_name = 'embeddingVec'
      `;
      const count = Number(rows[0]?.count ?? 0);
      if (count === 0) {
        console.warn(
          "[startup] ⚠️  pgvector migration NOT applied. " +
          "The `embeddingVec` column is missing from WorkspaceEmbedding. " +
          "Semantic search will fall back to slower in-memory ranking. " +
          "Run prisma/migrations/apply_vector_embeddings.sql in your database to enable ANN search."
        );
      } else {
        console.log("[startup] ✅ pgvector column `embeddingVec` detected — ANN search enabled.");
      }
    } catch (err) {
      // Non-fatal — database may not be reachable during build/test environments
      console.warn("[startup] pgvector health check skipped:", err instanceof Error ? err.message : err);
    }
  }
}
