import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateEmbedding, cosineSimilarity } from "./embeddings";

export interface RetrievedChunk {
  id: string;
  entityType: string;
  entityId: string;
  chunkIndex: number;
  title: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown> | null;
  url: string;
}

export interface SearchOptions {
  limit?: number;
  minSimilarity?: number;
  entityTypes?: string[];
}

/**
 * Builds the canonical frontend deep-link URL for an entity.
 */
export function buildEntityUrl(workspaceId: string, entityType: string, entityId: string): string {
  switch (entityType) {
    case "document":
      return `/workspace/${workspaceId}/docs/${entityId}`;
    case "goal":
      return `/workspace/${workspaceId}/goals?goalId=${entityId}`;
    case "milestone":
      return `/workspace/${workspaceId}/roadmap?milestoneId=${entityId}`;
    case "task":
      return `/workspace/${workspaceId}/tasks?taskId=${entityId}`;
    case "comment":
      return `/workspace/${workspaceId}/docs`;
    default:
      return `/workspace/${workspaceId}/board`;
  }
}

interface VectorSearchRow {
  id: string;
  entityType: string;
  entityId: string;
  chunkIndex: number;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  similarity: number;
}

/**
 * Searches the workspace's vectorized knowledge base using semantic cosine similarity.
 *
 * Fast path: pgvector ANN index ("embeddingVec" column + HNSW, see
 * prisma/migrations/apply_vector_embeddings.sql) — ranking happens in Postgres
 * with `ORDER BY embedding <=> query LIMIT k`, so only the top-k rows cross
 * the wire. Falls back to in-memory cosine ranking when the vector column or
 * extension is unavailable (migration not yet applied).
 */
export async function searchWorkspaceKnowledge(
  workspaceId: string,
  query: string,
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? 6;
  const minSimilarity = options.minSimilarity ?? 0.25;

  const queryVector = await generateEmbedding(query);
  const queryVecText = JSON.stringify(queryVector);

  // ── Fast path: push ranking down to Postgres via pgvector ────────────────
  try {
    // Over-fetch so the minSimilarity filter can still fill the top-k window
    const rows = await prisma.$queryRaw<VectorSearchRow[]>`
      SELECT "id", "entityType", "entityId", "chunkIndex", "title", "content", "metadata",
             1 - ("embeddingVec" <=> ${queryVecText}::vector) AS "similarity"
      FROM "WorkspaceEmbedding"
      WHERE "workspaceId" = ${workspaceId}
        AND "embeddingVec" IS NOT NULL
        ${
          options.entityTypes?.length
            ? Prisma.sql`AND "entityType" IN (${Prisma.join(options.entityTypes)})`
            : Prisma.empty
        }
      ORDER BY "embeddingVec" <=> ${queryVecText}::vector
      LIMIT ${limit * 3}
    `;

    return rows
      .map((row) => ({
        id: row.id,
        entityType: row.entityType,
        entityId: row.entityId,
        chunkIndex: row.chunkIndex,
        title: row.title,
        content: row.content,
        similarity: row.similarity,
        metadata: row.metadata ?? null,
        url: buildEntityUrl(workspaceId, row.entityType, row.entityId),
      }))
      .filter((item) => item.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (err) {
    // Column/extension missing (migration not applied) — fall through to the
    // in-memory path below so search keeps working.
    console.warn(
      "[semantic-search] pgvector path unavailable, using in-memory ranking:",
      err instanceof Error ? err.message : err
    );
  }

  // ── Fallback: fetch all chunks and rank in JavaScript ────────────────────
  const embeddings = await prisma.workspaceEmbedding.findMany({
    where: {
      workspaceId,
      ...(options.entityTypes?.length ? { entityType: { in: options.entityTypes } } : {}),
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      chunkIndex: true,
      title: true,
      content: true,
      embedding: true,
      metadata: true,
    },
  });

  if (embeddings.length === 0) {
    return [];
  }

  // Rank by cosine similarity
  const scored = embeddings
    .map((item) => {
      const sim = cosineSimilarity(queryVector, item.embedding as number[]);
      return {
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        chunkIndex: item.chunkIndex,
        title: item.title,
        content: item.content,
        similarity: sim,
        metadata: (item.metadata as Record<string, unknown>) ?? null,
        url: buildEntityUrl(workspaceId, item.entityType, item.entityId),
      };
    })
    .filter((item) => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity);

  // Return Top-K
  return scored.slice(0, limit);
}
