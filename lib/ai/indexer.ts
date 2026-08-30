import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  formatDocumentForEmbedding,
  formatGoalForEmbedding,
  formatMilestoneForEmbedding,
  formatTaskForEmbedding,
} from "./text-extractor";
import { chunkText } from "./chunker";
import { generateBatchEmbeddings } from "./embeddings";

// ── Types ──────────────────────────────────────────────────────────────────

export interface IndexStats {
  documentsCount: number;
  goalsCount: number;
  milestonesCount: number;
  tasksCount: number;
  totalChunks: number;
  lastIndexedAt: string | null;
}

interface RawChunk {
  workspaceId: string;
  entityType: string;
  entityId: string;
  chunkIndex: number;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

// ── Constants ─────────────────────────────────────────────────────────────

/** Max rows fetched per paginated pass to avoid unbounded heap usage. */
const PAGE_SIZE = 200;

/** Max rows per Prisma createMany to avoid oversized SQL statements. */
const INSERT_CHUNK_SIZE = 500;

// ── Stats cache (F-29) ────────────────────────────────────────────────────

interface StatsCache {
  stats: IndexStats;
  expiresAt: number;
}

const statsCache = new Map<string, StatsCache>();
const STATS_TTL_MS = 60_000; // 60 seconds

/**
 * Retrieves indexing stats for the workspace knowledge base.
 * Results are cached for 60 seconds to avoid hammering 6 parallel COUNT
 * queries every time the Copilot drawer opens.
 */
export async function getWorkspaceIndexStats(workspaceId: string): Promise<IndexStats> {
  const now = Date.now();
  const cached = statsCache.get(workspaceId);
  if (cached && now < cached.expiresAt) return cached.stats;

  const [docCount, goalCount, milestoneCount, taskCount, chunkCount, latestChunk] =
    await Promise.all([
      prisma.document.count({ where: { workspaceId } }),
      prisma.goal.count({ where: { workspaceId } }),
      prisma.milestone.count({ where: { goal: { workspaceId } } }),
      prisma.task.count({ where: { milestone: { goal: { workspaceId } } } }),
      prisma.workspaceEmbedding.count({ where: { workspaceId } }),
      prisma.workspaceEmbedding.findFirst({
        where: { workspaceId },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

  const stats: IndexStats = {
    documentsCount: docCount,
    goalsCount: goalCount,
    milestonesCount: milestoneCount,
    tasksCount: taskCount,
    totalChunks: chunkCount,
    lastIndexedAt: latestChunk?.updatedAt?.toISOString() ?? null,
  };

  statsCache.set(workspaceId, { stats, expiresAt: now + STATS_TTL_MS });
  return stats;
}

/** Invalidate the stats cache for a workspace after indexing completes. */
function invalidateStatsCache(workspaceId: string) {
  statsCache.delete(workspaceId);
}

// ── pgvector sync ─────────────────────────────────────────────────────────

/**
 * Syncs the native pgvector column ("embeddingVec") after a bulk insert.
 * No-op when the column does not exist yet — Float[] fallback search still
 * works. Uses a single UPDATE … FROM unnest() regardless of chunk count.
 */
async function syncVectorColumns(ids: string[], embeddings: number[][]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const vecTexts = embeddings.map((v) => JSON.stringify(v));
    await prisma.$executeRaw`
      UPDATE "WorkspaceEmbedding" e
      SET "embeddingVec" = x.vec::vector
      FROM unnest(${ids}::text[], ${vecTexts}::text[]) AS x(id, vec)
      WHERE e.id = x.id
    `;
  } catch (err) {
    // Migration not applied yet — expected on new deployments.
    console.warn(
      "[indexer] embeddingVec sync skipped (pgvector migration not applied?):",
      err instanceof Error ? err.message : err
    );
  }
}

// ── Paginated entity fetchers ─────────────────────────────────────────────

async function fetchAllDocuments(workspaceId: string) {
  const results = [];
  let skip = 0;
  while (true) {
    const batch = await prisma.document.findMany({
      where: { workspaceId },
      include: {
        author: { select: { name: true } },
        linkedGoal: { select: { title: true } },
        linkedMilestone: { select: { title: true } },
        linkedTask: { select: { title: true } },
      },
      skip,
      take: PAGE_SIZE,
    });
    results.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return results;
}

async function fetchAllGoals(workspaceId: string) {
  const results = [];
  let skip = 0;
  while (true) {
    const batch = await prisma.goal.findMany({
      where: { workspaceId },
      include: {
        milestones: { select: { title: true, status: true, targetDate: true } },
      },
      skip,
      take: PAGE_SIZE,
    });
    results.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return results;
}

async function fetchAllMilestones(workspaceId: string) {
  const results = [];
  let skip = 0;
  while (true) {
    const batch = await prisma.milestone.findMany({
      where: { goal: { workspaceId } },
      include: {
        goal: { select: { title: true } },
        tasks: { select: { title: true, status: true, priority: true } },
      },
      skip,
      take: PAGE_SIZE,
    });
    results.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return results;
}

async function fetchAllTasks(workspaceId: string) {
  const results = [];
  let skip = 0;
  while (true) {
    const batch = await prisma.task.findMany({
      where: { milestone: { goal: { workspaceId } } },
      include: {
        assignee: { select: { name: true } },
        milestone: { select: { title: true } },
        sprint: { select: { name: true } },
        comments: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
          // Cap comments per task to avoid runaway text size
          take: 50,
        },
      },
      skip,
      take: PAGE_SIZE,
    });
    results.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return results;
}

// ── Chunk builders ────────────────────────────────────────────────────────

type FetchedDocument = Awaited<ReturnType<typeof fetchAllDocuments>>[number];
type FetchedGoal     = Awaited<ReturnType<typeof fetchAllGoals>>[number];
type FetchedMilestone = Awaited<ReturnType<typeof fetchAllMilestones>>[number];
type FetchedTask     = Awaited<ReturnType<typeof fetchAllTasks>>[number];

function chunksForDocument(doc: FetchedDocument, workspaceId: string): RawChunk[] {
  const formatted = formatDocumentForEmbedding({
    id: doc.id, title: doc.title, content: doc.content,
    authorName: doc.author?.name,
    linkedGoalTitle: doc.linkedGoal?.title,
    linkedMilestoneTitle: doc.linkedMilestone?.title,
    linkedTaskTitle: doc.linkedTask?.title,
    updatedAt: doc.updatedAt,
  });
  return chunkText(formatted, { headerPrefix: `PRD: ${doc.title}` }).map((c) => ({
    workspaceId, entityType: "document", entityId: doc.id,
    chunkIndex: c.chunkIndex, title: doc.title, content: c.content,
    metadata: { authorName: doc.author?.name, updatedAt: doc.updatedAt },
  }));
}

function chunksForGoal(g: FetchedGoal, workspaceId: string): RawChunk[] {
  const formatted = formatGoalForEmbedding({
    id: g.id, title: g.title, objective: g.objective, status: g.status,
    healthScore: g.healthScore, targetDate: g.targetDate,
    keyResults: g.keyResults, milestones: g.milestones,
  });
  return chunkText(formatted, { headerPrefix: `Goal: ${g.title}` }).map((c) => ({
    workspaceId, entityType: "goal", entityId: g.id,
    chunkIndex: c.chunkIndex, title: g.title, content: c.content,
    metadata: { status: g.status, healthScore: g.healthScore, targetDate: g.targetDate },
  }));
}

function chunksForMilestone(m: FetchedMilestone, workspaceId: string): RawChunk[] {
  const formatted = formatMilestoneForEmbedding({
    id: m.id, title: m.title, description: m.description, status: m.status,
    goalTitle: m.goal?.title, startDate: m.startDate, targetDate: m.targetDate,
    dependsOn: m.dependsOn, tasks: m.tasks,
  });
  return chunkText(formatted, { headerPrefix: `Milestone: ${m.title}` }).map((c) => ({
    workspaceId, entityType: "milestone", entityId: m.id,
    chunkIndex: c.chunkIndex, title: m.title, content: c.content,
    metadata: { status: m.status, targetDate: m.targetDate },
  }));
}

function chunksForTask(t: FetchedTask, workspaceId: string): RawChunk[] {
  const formatted = formatTaskForEmbedding({
    id: t.id, title: t.title, description: t.description, status: t.status,
    priority: t.priority, storyPoints: t.storyPoints, dueDate: t.dueDate,
    assigneeName: t.assignee?.name, milestoneTitle: t.milestone?.title,
    sprintName: t.sprint?.name, blockedReason: t.blockedReason,
    comments: t.comments.map((c) => ({ authorName: c.author?.name || undefined, body: c.body })),
  });
  return chunkText(formatted, { headerPrefix: `Task: ${t.title}` }).map((c) => ({
    workspaceId, entityType: "task", entityId: t.id,
    chunkIndex: c.chunkIndex, title: t.title, content: c.content,
    metadata: { status: t.status, priority: t.priority, assigneeName: t.assignee?.name, blockedReason: t.blockedReason },
  }));
}

// ── Bulk insert helper ────────────────────────────────────────────────────

async function bulkInsertChunks(chunks: RawChunk[], embeddings: number[][]): Promise<string[]> {
  const ids = chunks.map(() => randomUUID());

  // Insert in batches of INSERT_CHUNK_SIZE to avoid oversized statements
  for (let i = 0; i < chunks.length; i += INSERT_CHUNK_SIZE) {
    const sliceChunks = chunks.slice(i, i + INSERT_CHUNK_SIZE);
    const sliceIds    = ids.slice(i, i + INSERT_CHUNK_SIZE);
    const sliceEmbs   = embeddings.slice(i, i + INSERT_CHUNK_SIZE);

    await prisma.workspaceEmbedding.createMany({
      data: sliceChunks.map((c, j) => ({
        id: sliceIds[j],
        workspaceId: c.workspaceId,
        entityType: c.entityType,
        entityId: c.entityId,
        chunkIndex: c.chunkIndex,
        title: c.title,
        content: c.content,
        embedding: sliceEmbs[j] || [],
        metadata: c.metadata as never,
      })),
    });
  }

  return ids;
}

// ── Public: full workspace reindex ────────────────────────────────────────

/**
 * Re-indexes all workspace documents, goals, milestones, and tasks.
 *
 * F-03 fixes applied:
 * - All entity fetches are paginated (PAGE_SIZE rows at a time) — no unbounded query.
 * - Embedding API calls use controlled parallelism (see generateBatchEmbeddings).
 * - createMany is chunked to INSERT_CHUNK_SIZE rows per statement.
 * - Stats cache is invalidated after completion.
 */
export async function indexWorkspace(workspaceId: string) {
  // Fetch all source entities with pagination (parallel across entity types)
  const [docs, goals, milestones, tasks] = await Promise.all([
    fetchAllDocuments(workspaceId),
    fetchAllGoals(workspaceId),
    fetchAllMilestones(workspaceId),
    fetchAllTasks(workspaceId),
  ]);

  const rawChunks: RawChunk[] = [
    ...docs.flatMap((d) => chunksForDocument(d, workspaceId)),
    ...goals.flatMap((g) => chunksForGoal(g, workspaceId)),
    ...milestones.flatMap((m) => chunksForMilestone(m, workspaceId)),
    ...tasks.flatMap((t) => chunksForTask(t, workspaceId)),
  ];

  if (rawChunks.length === 0) {
    await prisma.workspaceEmbedding.deleteMany({ where: { workspaceId } });
    invalidateStatsCache(workspaceId);
    return { documentsIndexed: 0, goalsIndexed: 0, milestonesIndexed: 0, tasksIndexed: 0, chunksCreated: 0 };
  }

  const embeddings = await generateBatchEmbeddings(rawChunks.map((c) => c.content));

  // Replace old embeddings atomically: delete first, then chunked insert
  await prisma.workspaceEmbedding.deleteMany({ where: { workspaceId } });
  const ids = await bulkInsertChunks(rawChunks, embeddings);

  // Populate native vector column (no-op pre-migration)
  await syncVectorColumns(ids, embeddings);

  invalidateStatsCache(workspaceId);

  return {
    documentsIndexed: docs.length,
    goalsIndexed: goals.length,
    milestonesIndexed: milestones.length,
    tasksIndexed: tasks.length,
    chunksCreated: rawChunks.length,
  };
}

// ── Public: single-entity incremental index ───────────────────────────────

/**
 * Indexes or re-indexes a single entity (Document, Task, Goal, Milestone).
 * Called fire-and-forget after every entity create/update.
 */
export async function indexSingleEntity(
  workspaceId: string,
  entityType: "document" | "goal" | "milestone" | "task",
  entityId: string
) {
  await prisma.workspaceEmbedding.deleteMany({ where: { workspaceId, entityId } });

  let chunks: RawChunk[] = [];

  if (entityType === "document") {
    const doc = await prisma.document.findUnique({
      where: { id: entityId },
      include: {
        author: { select: { name: true } },
        linkedGoal: { select: { title: true } },
        linkedMilestone: { select: { title: true } },
        linkedTask: { select: { title: true } },
      },
    });
    if (!doc) return;
    chunks = chunksForDocument(doc, workspaceId);
  } else if (entityType === "goal") {
    const g = await prisma.goal.findUnique({
      where: { id: entityId },
      include: { milestones: { select: { title: true, status: true, targetDate: true } } },
    });
    if (!g) return;
    chunks = chunksForGoal(g, workspaceId);
  } else if (entityType === "milestone") {
    const m = await prisma.milestone.findUnique({
      where: { id: entityId },
      include: {
        goal: { select: { title: true } },
        tasks: { select: { title: true, status: true, priority: true } },
      },
    });
    if (!m) return;
    chunks = chunksForMilestone(m, workspaceId);
  } else if (entityType === "task") {
    const t = await prisma.task.findUnique({
      where: { id: entityId },
      include: {
        assignee: { select: { name: true } },
        milestone: { select: { title: true } },
        sprint: { select: { name: true } },
        comments: {
          include: { author: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });
    if (!t) return;
    chunks = chunksForTask(t, workspaceId);
  }

  if (chunks.length === 0) return;

  const embeddings = await generateBatchEmbeddings(chunks.map((c) => c.content));
  const ids = await bulkInsertChunks(chunks, embeddings);
  await syncVectorColumns(ids, embeddings);

  invalidateStatsCache(workspaceId);
}
