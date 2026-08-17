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

/**
 * Searches the workspace's vectorized knowledge base using semantic cosine similarity.
 */
export async function searchWorkspaceKnowledge(
  workspaceId: string,
  query: string,
  options: SearchOptions = {}
): Promise<RetrievedChunk[]> {
  const limit = options.limit ?? 6;
  const minSimilarity = options.minSimilarity ?? 0.25;

  const queryVector = await generateEmbedding(query);

  // Fetch embeddings from DB for this workspace
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
