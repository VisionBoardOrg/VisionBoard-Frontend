/**
 * Utility functions to extract clean plain text and markdown representations
 * from various VisionBoard entities (Tiptap JSON documents, Goals, Milestones, Tasks, Comments).
 */

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Recursively converts a Tiptap JSON content tree into clean plain text / markdown.
 */
export function extractTextFromTiptap(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const tipNode = node as TiptapNode;

  if (tipNode.type === "text") {
    return tipNode.text || "";
  }

  if (Array.isArray(tipNode.content)) {
    const childTexts = tipNode.content.map(extractTextFromTiptap);

    switch (tipNode.type) {
      case "heading": {
        const level = typeof tipNode.attrs?.level === "number" ? tipNode.attrs.level : 1;
        const prefix = "#".repeat(level) + " ";
        return `\n\n${prefix}${childTexts.join("")}\n`;
      }
      case "paragraph":
        return `\n${childTexts.join("")}\n`;
      case "bulletList":
        return `\n${childTexts.join("")}\n`;
      case "orderedList":
        return `\n${childTexts.join("")}\n`;
      case "listItem":
        return `• ${childTexts.join("").trim()}\n`;
      case "blockquote":
        return `\n> ${childTexts.join("").trim()}\n`;
      case "codeBlock": {
        const lang = (tipNode.attrs?.language as string) || "";
        return `\n\`\`\`${lang}\n${childTexts.join("")}\n\`\`\`\n`;
      }
      default:
        return childTexts.join("");
    }
  }

  // If node is an array itself
  if (Array.isArray(node)) {
    return (node as unknown[]).map(extractTextFromTiptap).join(" ");
  }

  return "";
}

/**
 * Format a Document entity into a rich semantic string for chunking and embedding.
 */
export function formatDocumentForEmbedding(doc: {
  id: string;
  title: string;
  content: unknown;
  authorName?: string | null;
  linkedGoalTitle?: string | null;
  linkedMilestoneTitle?: string | null;
  linkedTaskTitle?: string | null;
  updatedAt: Date;
}): string {
  const contentText = extractTextFromTiptap(doc.content).trim();
  const metaLines: string[] = [
    `# PRD / Document: ${doc.title}`,
    doc.authorName ? `Author: ${doc.authorName}` : "",
    doc.linkedGoalTitle ? `Linked Goal: ${doc.linkedGoalTitle}` : "",
    doc.linkedMilestoneTitle ? `Linked Milestone: ${doc.linkedMilestoneTitle}` : "",
    doc.linkedTaskTitle ? `Linked Task: ${doc.linkedTaskTitle}` : "",
    `Last Updated: ${doc.updatedAt.toISOString().split("T")[0]}`,
    "---",
    contentText || "(Empty document body)",
  ].filter(Boolean);

  return metaLines.join("\n");
}

/**
 * Format a Goal entity (with OKRs and Milestones) into a rich semantic string.
 */
export function formatGoalForEmbedding(goal: {
  id: string;
  title: string;
  objective: string;
  status: string;
  healthScore?: number;
  targetDate?: Date | null;
  keyResults?: unknown;
  milestones?: Array<{ title: string; status: string; targetDate?: Date | null }>;
}): string {
  let krText = "";
  if (Array.isArray(goal.keyResults) && goal.keyResults.length > 0) {
    krText = goal.keyResults
      .map((kr: { title?: string; target?: number; unit?: string }) => `  - ${kr.title || "Key Result"}: Target ${kr.target ?? ""} ${kr.unit || ""}`)
      .join("\n");
  }

  let msText = "";
  if (goal.milestones && goal.milestones.length > 0) {
    msText = goal.milestones
      .map((m) => `  - Milestone: ${m.title} [Status: ${m.status}]${m.targetDate ? ` (Target: ${m.targetDate.toISOString().split("T")[0]})` : ""}`)
      .join("\n");
  }

  return [
    `# Goal: ${goal.title}`,
    `Status: ${goal.status} (Health Score: ${goal.healthScore ?? 0}%)`,
    goal.targetDate ? `Target Date: ${goal.targetDate.toISOString().split("T")[0]}` : "",
    `Objective: ${goal.objective}`,
    krText ? `Key Results (OKRs):\n${krText}` : "",
    msText ? `Associated Milestones:\n${msText}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Format a Milestone entity into a rich semantic string.
 */
export function formatMilestoneForEmbedding(milestone: {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  goalTitle?: string | null;
  startDate?: Date | null;
  targetDate?: Date | null;
  dependsOn?: string[];
  tasks?: Array<{ title: string; status: string; priority: string }>;
}): string {
  const taskText = milestone.tasks?.length
    ? milestone.tasks.map((t) => `  - Task: ${t.title} [${t.status}, Priority: ${t.priority}]`).join("\n")
    : "";

  return [
    `# Milestone: ${milestone.title}`,
    milestone.goalTitle ? `Parent Goal: ${milestone.goalTitle}` : "",
    `Status: ${milestone.status}`,
    milestone.startDate ? `Start Date: ${milestone.startDate.toISOString().split("T")[0]}` : "",
    milestone.targetDate ? `Target Date: ${milestone.targetDate.toISOString().split("T")[0]}` : "",
    milestone.dependsOn?.length ? `Depends On: ${milestone.dependsOn.join(", ")}` : "",
    milestone.description ? `Description: ${milestone.description}` : "",
    taskText ? `Child Tasks:\n${taskText}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Format a Task entity into a rich semantic string.
 */
export function formatTaskForEmbedding(task: {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  storyPoints?: number | null;
  dueDate?: Date | null;
  assigneeName?: string | null;
  milestoneTitle?: string | null;
  sprintName?: string | null;
  blockedReason?: string | null;
  comments?: Array<{ authorName?: string; body: string }>;
}): string {
  const commentsText = task.comments?.length
    ? task.comments.map((c) => `  - [${c.authorName || "User"}]: ${c.body}`).join("\n")
    : "";

  return [
    `# Task: ${task.title}`,
    `Status: ${task.status} | Priority: ${task.priority}`,
    task.storyPoints ? `Story Points: ${task.storyPoints}` : "",
    task.assigneeName ? `Assignee: ${task.assigneeName}` : "Unassigned",
    task.dueDate ? `Due Date: ${task.dueDate.toISOString().split("T")[0]}` : "",
    task.milestoneTitle ? `Milestone: ${task.milestoneTitle}` : "",
    task.sprintName ? `Sprint: ${task.sprintName}` : "",
    task.blockedReason ? `⚠️ BLOCKER REASON: ${task.blockedReason}` : "",
    task.description ? `Description: ${task.description}` : "",
    commentsText ? `Discussion & Comments:\n${commentsText}` : "",
  ].filter(Boolean).join("\n");
}
