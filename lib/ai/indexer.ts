import { prisma } from "@/lib/prisma";
import {
  formatDocumentForEmbedding,
  formatGoalForEmbedding,
  formatMilestoneForEmbedding,
  formatTaskForEmbedding,
} from "./text-extractor";
import { chunkText } from "./chunker";
import { generateBatchEmbeddings, generateEmbedding } from "./embeddings";

export interface IndexStats {
  documentsCount: number;
  goalsCount: number;
  milestonesCount: number;
  tasksCount: number;
  totalChunks: number;
  lastIndexedAt: string | null;
}

/**
 * Retrieves indexing stats for the workspace knowledge base.
 */
export async function getWorkspaceIndexStats(workspaceId: string): Promise<IndexStats> {
  const [docCount, goalCount, milestoneCount, taskCount, chunkCount, latestChunk] = await Promise.all([
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

  return {
    documentsCount: docCount,
    goalsCount: goalCount,
    milestonesCount: milestoneCount,
    tasksCount: taskCount,
    totalChunks: chunkCount,
    lastIndexedAt: latestChunk?.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Re-indexes all workspace documents, goals, milestones, and tasks.
 */
export async function indexWorkspace(workspaceId: string) {
  // 1. Fetch all documents
  const docs = await prisma.document.findMany({
    where: { workspaceId },
    include: {
      author: { select: { name: true } },
      linkedGoal: { select: { title: true } },
      linkedMilestone: { select: { title: true } },
      linkedTask: { select: { title: true } },
    },
  });

  // 2. Fetch all goals
  const goals = await prisma.goal.findMany({
    where: { workspaceId },
    include: {
      milestones: { select: { title: true, status: true, targetDate: true } },
    },
  });

  // 3. Fetch all milestones
  const milestones = await prisma.milestone.findMany({
    where: { goal: { workspaceId } },
    include: {
      goal: { select: { title: true } },
      tasks: { select: { title: true, status: true, priority: true } },
    },
  });

  // 4. Fetch all tasks
  const tasks = await prisma.task.findMany({
    where: { milestone: { goal: { workspaceId } } },
    include: {
      assignee: { select: { name: true } },
      milestone: { select: { title: true } },
      sprint: { select: { name: true } },
      comments: {
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Prepare chunks to embed
  const rawChunksToProcess: Array<{
    workspaceId: string;
    entityType: string;
    entityId: string;
    chunkIndex: number;
    title: string;
    content: string;
    metadata: Record<string, unknown>;
  }> = [];

  // Documents
  for (const doc of docs) {
    const formatted = formatDocumentForEmbedding({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      authorName: doc.author?.name,
      linkedGoalTitle: doc.linkedGoal?.title,
      linkedMilestoneTitle: doc.linkedMilestone?.title,
      linkedTaskTitle: doc.linkedTask?.title,
      updatedAt: doc.updatedAt,
    });
    const chunks = chunkText(formatted, { headerPrefix: `PRD: ${doc.title}` });
    chunks.forEach((c) => {
      rawChunksToProcess.push({
        workspaceId,
        entityType: "document",
        entityId: doc.id,
        chunkIndex: c.chunkIndex,
        title: doc.title,
        content: c.content,
        metadata: {
          authorName: doc.author?.name,
          updatedAt: doc.updatedAt,
        },
      });
    });
  }

  // Goals
  for (const g of goals) {
    const formatted = formatGoalForEmbedding({
      id: g.id,
      title: g.title,
      objective: g.objective,
      status: g.status,
      healthScore: g.healthScore,
      targetDate: g.targetDate,
      keyResults: g.keyResults,
      milestones: g.milestones,
    });
    const chunks = chunkText(formatted, { headerPrefix: `Goal: ${g.title}` });
    chunks.forEach((c) => {
      rawChunksToProcess.push({
        workspaceId,
        entityType: "goal",
        entityId: g.id,
        chunkIndex: c.chunkIndex,
        title: g.title,
        content: c.content,
        metadata: {
          status: g.status,
          healthScore: g.healthScore,
          targetDate: g.targetDate,
        },
      });
    });
  }

  // Milestones
  for (const m of milestones) {
    const formatted = formatMilestoneForEmbedding({
      id: m.id,
      title: m.title,
      description: m.description,
      status: m.status,
      goalTitle: m.goal?.title,
      startDate: m.startDate,
      targetDate: m.targetDate,
      dependsOn: m.dependsOn,
      tasks: m.tasks,
    });
    const chunks = chunkText(formatted, { headerPrefix: `Milestone: ${m.title}` });
    chunks.forEach((c) => {
      rawChunksToProcess.push({
        workspaceId,
        entityType: "milestone",
        entityId: m.id,
        chunkIndex: c.chunkIndex,
        title: m.title,
        content: c.content,
        metadata: {
          status: m.status,
          targetDate: m.targetDate,
        },
      });
    });
  }

  // Tasks
  for (const t of tasks) {
    const formatted = formatTaskForEmbedding({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      storyPoints: t.storyPoints,
      dueDate: t.dueDate,
      assigneeName: t.assignee?.name,
      milestoneTitle: t.milestone?.title,
      sprintName: t.sprint?.name,
      blockedReason: t.blockedReason,
      comments: t.comments.map((c) => ({ authorName: c.author?.name || undefined, body: c.body })),
    });
    const chunks = chunkText(formatted, { headerPrefix: `Task: ${t.title}` });
    chunks.forEach((c) => {
      rawChunksToProcess.push({
        workspaceId,
        entityType: "task",
        entityId: t.id,
        chunkIndex: c.chunkIndex,
        title: t.title,
        content: c.content,
        metadata: {
          status: t.status,
          priority: t.priority,
          assigneeName: t.assignee?.name,
          blockedReason: t.blockedReason,
        },
      });
    });
  }

  if (rawChunksToProcess.length === 0) {
    await prisma.workspaceEmbedding.deleteMany({ where: { workspaceId } });
    return {
      documentsIndexed: 0,
      goalsIndexed: 0,
      milestonesIndexed: 0,
      tasksIndexed: 0,
      chunksCreated: 0,
    };
  }

  // Generate embeddings for all text chunks in batch
  const chunkTexts = rawChunksToProcess.map((c) => c.content);
  const embeddings = await generateBatchEmbeddings(chunkTexts);

  // Replace old embeddings for this workspace
  await prisma.$transaction([
    prisma.workspaceEmbedding.deleteMany({ where: { workspaceId } }),
    prisma.workspaceEmbedding.createMany({
      data: rawChunksToProcess.map((c, i) => ({
        workspaceId: c.workspaceId,
        entityType: c.entityType,
        entityId: c.entityId,
        chunkIndex: c.chunkIndex,
        title: c.title,
        content: c.content,
        embedding: embeddings[i] || [],
        metadata: c.metadata as never,
      })),
    }),
  ]);

  return {
    documentsIndexed: docs.length,
    goalsIndexed: goals.length,
    milestonesIndexed: milestones.length,
    tasksIndexed: tasks.length,
    chunksCreated: rawChunksToProcess.length,
  };
}

/**
 * Indexes or re-indexes a single entity (Document, Task, Goal, Milestone).
 */
export async function indexSingleEntity(
  workspaceId: string,
  entityType: "document" | "goal" | "milestone" | "task",
  entityId: string
) {
  // Delete existing embeddings for this entity
  await prisma.workspaceEmbedding.deleteMany({
    where: { workspaceId, entityId },
  });

  let chunksToInsert: Array<{
    workspaceId: string;
    entityType: string;
    entityId: string;
    chunkIndex: number;
    title: string;
    content: string;
    metadata: Record<string, unknown>;
  }> = [];

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

    const formatted = formatDocumentForEmbedding({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      authorName: doc.author?.name,
      linkedGoalTitle: doc.linkedGoal?.title,
      linkedMilestoneTitle: doc.linkedMilestone?.title,
      linkedTaskTitle: doc.linkedTask?.title,
      updatedAt: doc.updatedAt,
    });
    const chunks = chunkText(formatted, { headerPrefix: `PRD: ${doc.title}` });
    chunksToInsert = chunks.map((c) => ({
      workspaceId,
      entityType: "document",
      entityId: doc.id,
      chunkIndex: c.chunkIndex,
      title: doc.title,
      content: c.content,
      metadata: { authorName: doc.author?.name, updatedAt: doc.updatedAt },
    }));
  } else if (entityType === "goal") {
    const g = await prisma.goal.findUnique({
      where: { id: entityId },
      include: {
        milestones: { select: { title: true, status: true, targetDate: true } },
      },
    });
    if (!g) return;

    const formatted = formatGoalForEmbedding({
      id: g.id,
      title: g.title,
      objective: g.objective,
      status: g.status,
      healthScore: g.healthScore,
      targetDate: g.targetDate,
      keyResults: g.keyResults,
      milestones: g.milestones,
    });
    const chunks = chunkText(formatted, { headerPrefix: `Goal: ${g.title}` });
    chunksToInsert = chunks.map((c) => ({
      workspaceId,
      entityType: "goal",
      entityId: g.id,
      chunkIndex: c.chunkIndex,
      title: g.title,
      content: c.content,
      metadata: { status: g.status, healthScore: g.healthScore, targetDate: g.targetDate },
    }));
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
        },
      },
    });
    if (!t) return;

    const formatted = formatTaskForEmbedding({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      storyPoints: t.storyPoints,
      dueDate: t.dueDate,
      assigneeName: t.assignee?.name,
      milestoneTitle: t.milestone?.title,
      sprintName: t.sprint?.name,
      blockedReason: t.blockedReason,
      comments: t.comments.map((c) => ({ authorName: c.author?.name || undefined, body: c.body })),
    });
    const chunks = chunkText(formatted, { headerPrefix: `Task: ${t.title}` });
    chunksToInsert = chunks.map((c) => ({
      workspaceId,
      entityType: "task",
      entityId: t.id,
      chunkIndex: c.chunkIndex,
      title: t.title,
      content: c.content,
      metadata: { status: t.status, priority: t.priority, assigneeName: t.assignee?.name, blockedReason: t.blockedReason },
    }));
  }

  if (chunksToInsert.length === 0) return;

  const embeddings = await Promise.all(chunksToInsert.map((c) => generateEmbedding(c.content)));

  await prisma.workspaceEmbedding.createMany({
    data: chunksToInsert.map((c, i) => ({
      workspaceId: c.workspaceId,
      entityType: c.entityType,
      entityId: c.entityId,
      chunkIndex: c.chunkIndex,
      title: c.title,
      content: c.content,
      embedding: embeddings[i] || [],
      metadata: c.metadata as never,
    })),
  });
}
