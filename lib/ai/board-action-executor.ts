import { prisma } from "@/lib/prisma";
import { syncMilestoneStatus } from "@/lib/milestone-sync";
import { calculateGoalHealth } from "@/lib/goal-health";
import { dispatchTaskAssignmentNotification } from "@/lib/notifications";
import { z } from "zod";

export const BoardActionTypeSchema = z.enum([
  "delete_milestone",
  "delete_task",
  "delete_goal",
  "assign_task",
  "update_task",
  "update_milestone",
  "create_task",
  "create_milestone",
]);

export type BoardActionType = z.infer<typeof BoardActionTypeSchema>;

export interface RawBoardAction {
  action: BoardActionType | string;
  milestoneId?: string;
  taskId?: string;
  goalId?: string;
  id?: string;
  tempId?: string;
  title?: string;
  taskTitle?: string;
  milestoneTitle?: string;
  goalTitle?: string;
  tasks?: Array<string | { title?: string; taskTitle?: string; priority?: string; assigneeId?: string }>;
  suggestedTasks?: Array<string | { title?: string; taskTitle?: string; priority?: string; assigneeId?: string }>;
  assigneeId?: string | null;
  assigneeName?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  targetDate?: string | null;
  description?: string;
  blockedReason?: string | null;
  [key: string]: unknown;
}

export interface ExecutedBoardAction {
  id: string; // unique execution ID for client-side keys
  action: BoardActionType;
  entityType: "milestone" | "task" | "goal";
  entityId: string;
  entityTitle: string;
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  undoData?: Record<string, unknown>;
  canUndo: boolean;
  appliedAt: string;
}

/**
 * Execute a series of parsed board actions within a workspace.
 * Validates workspace ownership, performs operations in Prisma,
 * logs activity, and generates undo snapshots.
 */
function getActionPriority(action: string): number {
  switch (action) {
    case "create_goal":
      return 1;
    case "create_milestone":
      return 2;
    case "create_task":
      return 3;
    case "assign_task":
    case "update_task":
    case "update_milestone":
      return 4;
    case "delete_task":
      return 5;
    case "delete_milestone":
      return 6;
    case "delete_goal":
      return 7;
    default:
      return 4;
  }
}

export async function executeBoardActions(
  workspaceId: string,
  userId: string,
  rawActions: RawBoardAction[]
): Promise<ExecutedBoardAction[]> {
  const executed: ExecutedBoardAction[] = [];

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const currentUserName = currentUser?.name || "AI Copilot";

  // Sort actions so milestone and goal creations run before task creations that depend on them
  const sortedActions = [...rawActions].sort((a, b) => {
    return getActionPriority(String(a.action)) - getActionPriority(String(b.action));
  });

  const newlyCreatedGoals = new Map<string, { id: string; title: string }>();
  let lastCreatedGoalId: string | null = null;

  const newlyCreatedMilestones = new Map<string, { id: string; title: string; goalId: string }>();
  let lastCreatedMilestoneId: string | null = null;

  for (const raw of sortedActions) {
    const actionKey = raw.action;
    const executionId = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      if (actionKey === "delete_milestone") {
        const milestoneId = raw.milestoneId || raw.id;
        if (!milestoneId) {
          executed.push({
            id: executionId,
            action: "delete_milestone",
            entityType: "milestone",
            entityId: "",
            entityTitle: raw.title || raw.milestoneTitle || "Unknown Milestone",
            success: false,
            message: "Missing milestone ID to delete.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const milestone = await prisma.milestone.findUnique({
          where: { id: milestoneId },
          include: {
            goal: { select: { workspaceId: true, title: true } },
            tasks: true,
          },
        });

        if (!milestone || milestone.goal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "delete_milestone",
            entityType: "milestone",
            entityId: milestoneId,
            entityTitle: raw.title || raw.milestoneTitle || "Milestone",
            success: false,
            message: "Milestone not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        // Snapshot for undo
        const undoData = {
          milestone: {
            id: milestone.id,
            goalId: milestone.goalId,
            title: milestone.title,
            description: milestone.description,
            status: milestone.status,
            targetDate: milestone.targetDate?.toISOString() ?? null,
            startDate: milestone.startDate?.toISOString() ?? null,
            dependsOn: milestone.dependsOn,
            order: milestone.order,
          },
          tasks: milestone.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            assigneeId: t.assigneeId,
            status: t.status,
            priority: t.priority,
            storyPoints: t.storyPoints,
            dueDate: t.dueDate?.toISOString() ?? null,
            order: t.order,
            workspaceId: t.workspaceId,
          })),
        };

        await prisma.milestone.delete({ where: { id: milestoneId } });

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "milestone",
            entityId: milestoneId,
            action: "deleted",
            diff: { title: milestone.title, deletedBy: "AI Copilot" },
          },
        }).catch(() => {});

        executed.push({
          id: executionId,
          action: "delete_milestone",
          entityType: "milestone",
          entityId: milestoneId,
          entityTitle: milestone.title,
          success: true,
          message: `Deleted milestone "${milestone.title}".`,
          details: { goalTitle: milestone.goal.title },
          undoData,
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "delete_task") {
        const taskId = raw.taskId || raw.id;
        if (!taskId) {
          executed.push({
            id: executionId,
            action: "delete_task",
            entityType: "task",
            entityId: "",
            entityTitle: raw.title || raw.taskTitle || "Unknown Task",
            success: false,
            message: "Missing task ID to delete.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            milestone: {
              select: {
                id: true,
                title: true,
                goal: { select: { workspaceId: true } },
              },
            },
          },
        });

        if (!task || task.milestone.goal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "delete_task",
            entityType: "task",
            entityId: taskId,
            entityTitle: raw.title || raw.taskTitle || "Task",
            success: false,
            message: "Task not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const undoData = {
          task: {
            id: task.id,
            milestoneId: task.milestoneId,
            workspaceId: task.workspaceId,
            title: task.title,
            description: task.description,
            assigneeId: task.assigneeId,
            status: task.status,
            priority: task.priority,
            storyPoints: task.storyPoints,
            dueDate: task.dueDate?.toISOString() ?? null,
            order: task.order,
          },
        };

        await prisma.task.delete({ where: { id: taskId } });

        syncMilestoneStatus(task.milestoneId).catch(() => {});

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "task",
            entityId: taskId,
            action: "deleted",
            diff: { title: task.title, deletedBy: "AI Copilot" },
          },
        }).catch(() => {});

        executed.push({
          id: executionId,
          action: "delete_task",
          entityType: "task",
          entityId: taskId,
          entityTitle: task.title,
          success: true,
          message: `Deleted task "${task.title}".`,
          details: { milestoneTitle: task.milestone.title },
          undoData,
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "delete_goal") {
        const goalId = raw.goalId || raw.id;
        if (!goalId) {
          executed.push({
            id: executionId,
            action: "delete_goal",
            entityType: "goal",
            entityId: "",
            entityTitle: raw.title || raw.goalTitle || "Unknown Goal",
            success: false,
            message: "Missing goal ID to delete.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const goal = await prisma.goal.findUnique({
          where: { id: goalId },
        });

        if (!goal || goal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "delete_goal",
            entityType: "goal",
            entityId: goalId,
            entityTitle: raw.title || raw.goalTitle || "Goal",
            success: false,
            message: "Goal not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        await prisma.goal.delete({ where: { id: goalId } });

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "goal",
            entityId: goalId,
            action: "deleted",
            diff: { title: goal.title, deletedBy: "AI Copilot" },
          },
        }).catch(() => {});

        executed.push({
          id: executionId,
          action: "delete_goal",
          entityType: "goal",
          entityId: goalId,
          entityTitle: goal.title,
          success: true,
          message: `Deleted goal "${goal.title}".`,
          canUndo: false,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "assign_task") {
        const taskId = raw.taskId || raw.id;
        const targetAssigneeId = raw.assigneeId;

        if (!taskId) {
          executed.push({
            id: executionId,
            action: "assign_task",
            entityType: "task",
            entityId: "",
            entityTitle: raw.title || raw.taskTitle || "Unknown Task",
            success: false,
            message: "Missing task ID to assign.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            milestone: {
              select: {
                id: true,
                title: true,
                goal: { select: { workspaceId: true } },
              },
            },
            assignee: { select: { id: true, name: true } },
          },
        });

        if (!task || task.milestone.goal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "assign_task",
            entityType: "task",
            entityId: taskId,
            entityTitle: raw.title || raw.taskTitle || "Task",
            success: false,
            message: "Task not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        let resolvedAssigneeName = "Unassigned";
        if (targetAssigneeId) {
          const assigneeMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: targetAssigneeId } },
            include: { user: { select: { id: true, name: true, email: true } } },
          });

          if (!assigneeMember) {
            executed.push({
              id: executionId,
              action: "assign_task",
              entityType: "task",
              entityId: taskId,
              entityTitle: task.title,
              success: false,
              message: `Member ${raw.assigneeName || targetAssigneeId} is not in this workspace.`,
              canUndo: false,
              appliedAt: new Date().toISOString(),
            });
            continue;
          }
          resolvedAssigneeName = assigneeMember.user.name || assigneeMember.user.email;
        }

        const prevAssigneeId = task.assigneeId;
        const prevAssigneeName = task.assignee?.name || "Unassigned";

        await prisma.task.update({
          where: { id: taskId },
          data: { assigneeId: targetAssigneeId || null },
        });

        if (targetAssigneeId && targetAssigneeId !== prevAssigneeId) {
          dispatchTaskAssignmentNotification({
            assigneeId: targetAssigneeId,
            assignerId: userId,
            assignerName: currentUserName,
            taskId: task.id,
            taskTitle: task.title,
            workspaceId,
          }).catch(() => {});
        }

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "task",
            entityId: taskId,
            action: "reassigned",
            diff: {
              previousAssigneeId: prevAssigneeId,
              newAssigneeId: targetAssigneeId,
              newAssigneeName: resolvedAssigneeName,
            },
          },
        }).catch(() => {});

        executed.push({
          id: executionId,
          action: "assign_task",
          entityType: "task",
          entityId: taskId,
          entityTitle: task.title,
          success: true,
          message: targetAssigneeId
            ? `Assigned ${resolvedAssigneeName} to "${task.title}".`
            : `Unassigned "${task.title}".`,
          details: {
            assigneeId: targetAssigneeId || null,
            assigneeName: resolvedAssigneeName,
            milestoneId: task.milestoneId,
            milestoneTitle: task.milestone.title,
          },
          undoData: {
            taskId: task.id,
            prevAssigneeId: prevAssigneeId || null,
            prevAssigneeName,
          },
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "update_task") {
        const taskId = raw.taskId || raw.id;
        if (!taskId) {
          executed.push({
            id: executionId,
            action: "update_task",
            entityType: "task",
            entityId: "",
            entityTitle: raw.title || raw.taskTitle || "Unknown Task",
            success: false,
            message: "Missing task ID to update.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            milestone: {
              select: {
                id: true,
                title: true,
                goalId: true,
                goal: { select: { workspaceId: true } },
              },
            },
          },
        });

        if (!task || task.milestone.goal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "update_task",
            entityType: "task",
            entityId: taskId,
            entityTitle: raw.title || raw.taskTitle || "Task",
            success: false,
            message: "Task not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const updates: Record<string, unknown> = {};
        const undoUpdates: Record<string, unknown> = {};

        if (raw.title && typeof raw.title === "string") {
          updates.title = raw.title.trim();
          undoUpdates.title = task.title;
        }

        if (raw.status) {
          const s = String(raw.status).toLowerCase();
          const validStatuses = ["todo", "in_progress", "in_review", "blocked", "done"] as const;
          type ValidStatus = typeof validStatuses[number];
          const matchedStatus = validStatuses.find((v) => v === s || v.replace("_", "") === s.replace(/[\s_-]/g, ""));
          if (matchedStatus) {
            updates.status = matchedStatus as ValidStatus;
            undoUpdates.status = task.status;
            if (matchedStatus !== "blocked") updates.blockedReason = null;
          }
        }

        if (raw.priority) {
          const p = String(raw.priority).toLowerCase();
          const validPriorities = ["low", "medium", "high", "urgent"] as const;
          type ValidPriority = typeof validPriorities[number];
          const matchedPriority = validPriorities.find((v) => v === p);
          if (matchedPriority) {
            updates.priority = matchedPriority as ValidPriority;
            undoUpdates.priority = task.priority;
          }
        }

        if (raw.dueDate !== undefined) {
          const parsedDate = raw.dueDate ? new Date(raw.dueDate) : null;
          updates.dueDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;
          undoUpdates.dueDate = task.dueDate?.toISOString() ?? null;
        }

        if (raw.blockedReason !== undefined) {
          updates.blockedReason = raw.blockedReason ? String(raw.blockedReason).slice(0, 500) : null;
          undoUpdates.blockedReason = task.blockedReason;
        }

        if (Object.keys(updates).length === 0) {
          executed.push({
            id: executionId,
            action: "update_task",
            entityType: "task",
            entityId: taskId,
            entityTitle: task.title,
            success: false,
            message: "No valid changes specified for task.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const updatedTask = await prisma.task.update({
          where: { id: taskId },
          data: updates as never,
        });

        if (updates.status) {
          syncMilestoneStatus(task.milestoneId).catch(() => {});
          if (task.milestone.goalId) {
            calculateGoalHealth(task.milestone.goalId).catch(() => {});
          }
        }

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "task",
            entityId: taskId,
            action: "updated",
            diff: updates as never,
          },
        }).catch(() => {});

        const changeDescriptions = Object.entries(updates)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(", ");

        executed.push({
          id: executionId,
          action: "update_task",
          entityType: "task",
          entityId: taskId,
          entityTitle: updatedTask.title,
          success: true,
          message: `Updated task "${updatedTask.title}" (${changeDescriptions}).`,
          details: { updates, milestoneId: task.milestoneId },
          undoData: { taskId: task.id, undoUpdates },
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "update_milestone") {
        const milestoneId = raw.milestoneId || raw.id;
        if (!milestoneId) {
          executed.push({
            id: executionId,
            action: "update_milestone",
            entityType: "milestone",
            entityId: "",
            entityTitle: raw.title || raw.milestoneTitle || "Unknown Milestone",
            success: false,
            message: "Missing milestone ID to update.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const milestone = await prisma.milestone.findUnique({
          where: { id: milestoneId },
          include: { goal: { select: { workspaceId: true, id: true } } },
        });

        if (!milestone || milestone.goal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "update_milestone",
            entityType: "milestone",
            entityId: milestoneId,
            entityTitle: raw.title || raw.milestoneTitle || "Milestone",
            success: false,
            message: "Milestone not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const updates: Record<string, unknown> = {};
        const undoUpdates: Record<string, unknown> = {};

        if (raw.title && typeof raw.title === "string") {
          updates.title = raw.title.trim();
          undoUpdates.title = milestone.title;
        }

        if (raw.status) {
          const s = String(raw.status).toLowerCase();
          const validStatuses = ["planned", "in_progress", "completed", "delayed"] as const;
          type ValidMilestoneStatus = typeof validStatuses[number];
          const matchedStatus = validStatuses.find((v) => v === s || v.replace("_", "") === s.replace(/[\s_-]/g, ""));
          if (matchedStatus) {
            updates.status = matchedStatus as ValidMilestoneStatus;
            undoUpdates.status = milestone.status;
          }
        }

        if (raw.targetDate !== undefined) {
          const parsedDate = raw.targetDate ? new Date(raw.targetDate) : null;
          updates.targetDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;
          undoUpdates.targetDate = milestone.targetDate?.toISOString() ?? null;
        }

        if (Object.keys(updates).length === 0) {
          executed.push({
            id: executionId,
            action: "update_milestone",
            entityType: "milestone",
            entityId: milestoneId,
            entityTitle: milestone.title,
            success: false,
            message: "No valid changes specified for milestone.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const updatedMilestone = await prisma.milestone.update({
          where: { id: milestoneId },
          data: updates as never,
        });

        if (updates.status && milestone.goal.id) {
          calculateGoalHealth(milestone.goal.id).catch(() => {});
        }

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "milestone",
            entityId: milestoneId,
            action: "updated",
            diff: updates as never,
          },
        }).catch(() => {});

        const changeDescriptions = Object.entries(updates)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(", ");

        executed.push({
          id: executionId,
          action: "update_milestone",
          entityType: "milestone",
          entityId: milestoneId,
          entityTitle: updatedMilestone.title,
          success: true,
          message: `Updated milestone "${updatedMilestone.title}" (${changeDescriptions}).`,
          details: { updates, goalId: milestone.goal.id },
          undoData: { milestoneId: milestone.id, undoUpdates },
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "create_task") {
        let milestoneId = raw.milestoneId;
        const taskTitle = raw.title || raw.taskTitle;

        if (!taskTitle) {
          executed.push({
            id: executionId,
            action: "create_task",
            entityType: "task",
            entityId: "",
            entityTitle: "New Task",
            success: false,
            message: "Task title is required.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        // STEP 1: Check if milestoneId or milestoneTitle points to a newly created milestone in this batch!
        let resolvedMilestone: { id: string; title: string; goal?: { workspaceId: string } } | null = null;

        const checkTitle = raw.milestoneTitle ? String(raw.milestoneTitle).toLowerCase().trim() : null;
        const checkId = milestoneId ? String(milestoneId).toLowerCase().trim() : null;

        if (checkId && newlyCreatedMilestones.has(checkId)) {
          const match = newlyCreatedMilestones.get(checkId)!;
          milestoneId = match.id;
        } else if (checkTitle && newlyCreatedMilestones.has(checkTitle)) {
          const match = newlyCreatedMilestones.get(checkTitle)!;
          milestoneId = match.id;
        } else if (
          (!milestoneId ||
            milestoneId === "new" ||
            milestoneId === "latest" ||
            milestoneId === "last" ||
            milestoneId === "temp" ||
            milestoneId === "$1" ||
            milestoneId.startsWith("temp-")) &&
          lastCreatedMilestoneId
        ) {
          milestoneId = lastCreatedMilestoneId;
        }

        // STEP 2: If we have an ID, query Prisma
        if (milestoneId) {
          resolvedMilestone = await prisma.milestone.findUnique({
            where: { id: milestoneId },
            include: { goal: { select: { workspaceId: true } } },
          });
        }

        // STEP 3: If not found by ID, try searching by title in DB!
        // (LLM often passes milestoneTitle, or puts the title inside milestoneId: "Host DevFest Fuoye")
        if (!resolvedMilestone) {
          const titleToSearch = (raw.milestoneTitle || raw.milestoneId || "").trim();
          if (titleToSearch && titleToSearch !== "new" && titleToSearch !== "latest") {
            resolvedMilestone = await prisma.milestone.findFirst({
              where: {
                goal: { workspaceId },
                title: { contains: titleToSearch, mode: "insensitive" },
              },
              include: { goal: { select: { workspaceId: true } } },
              orderBy: { createdAt: "desc" },
            });
            if (resolvedMilestone) {
              milestoneId = resolvedMilestone.id;
            }
          }
        }

        // STEP 4: If still not found, but a milestone was created in this batch, use lastCreatedMilestoneId!
        if (!resolvedMilestone && lastCreatedMilestoneId) {
          resolvedMilestone = await prisma.milestone.findUnique({
            where: { id: lastCreatedMilestoneId },
            include: { goal: { select: { workspaceId: true } } },
          });
          if (resolvedMilestone) {
            milestoneId = resolvedMilestone.id;
          }
        }

        if (!resolvedMilestone || resolvedMilestone.goal?.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "create_task",
            entityType: "task",
            entityId: "",
            entityTitle: String(taskTitle),
            success: false,
            message: "Target milestone not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        milestoneId = resolvedMilestone.id;

        const lastTask = await prisma.task.findFirst({
          where: { milestoneId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const nextOrder = (lastTask?.order ?? -1) + 1;

        const priorityVal = raw.priority && ["low", "medium", "high", "urgent"].includes(String(raw.priority).toLowerCase())
          ? (String(raw.priority).toLowerCase() as "low" | "medium" | "high" | "urgent")
          : "medium";

        let assigneeIdToSet: string | null = null;
        if (raw.assigneeId) {
          const isMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: raw.assigneeId } },
          });
          if (isMember) assigneeIdToSet = raw.assigneeId;
        }

        const createdTask = await prisma.task.create({
          data: {
            title: String(taskTitle).trim(),
            milestoneId,
            workspaceId,
            priority: priorityVal,
            assigneeId: assigneeIdToSet,
            order: nextOrder,
            status: "todo",
          },
        });

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "task",
            entityId: createdTask.id,
            action: "created",
            diff: { title: createdTask.title, milestoneId },
          },
        }).catch(() => {});

        executed.push({
          id: executionId,
          action: "create_task",
          entityType: "task",
          entityId: createdTask.id,
          entityTitle: createdTask.title,
          success: true,
          message: `Created task "${createdTask.title}" under milestone "${resolvedMilestone.title}".`,
          details: {
            taskId: createdTask.id,
            milestoneId,
            milestoneTitle: resolvedMilestone.title,
            priority: createdTask.priority,
            assigneeId: assigneeIdToSet,
          },
          undoData: { taskId: createdTask.id },
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      } else if (actionKey === "create_milestone") {
        let goalId = raw.goalId;
        const milestoneTitle = raw.title || raw.milestoneTitle;

        if (!milestoneTitle) {
          executed.push({
            id: executionId,
            action: "create_milestone",
            entityType: "milestone",
            entityId: "",
            entityTitle: "New Milestone",
            success: false,
            message: "Milestone title is required.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        // Resolve target goal: check newly created goals, DB by ID, DB by title, or active goal in workspace
        let resolvedGoal: { id: string; title: string; workspaceId: string } | null = null;

        if (goalId) {
          const newlyCreated = newlyCreatedGoals.get(goalId) ||
            newlyCreatedGoals.get(String(goalId).toLowerCase().trim()) ||
            (raw.goalTitle ? newlyCreatedGoals.get(String(raw.goalTitle).toLowerCase().trim()) : null);
          if (newlyCreated) {
            goalId = newlyCreated.id;
          }
          resolvedGoal = await prisma.goal.findUnique({
            where: { id: goalId },
          });
        }

        if (!resolvedGoal && raw.goalTitle) {
          resolvedGoal = await prisma.goal.findFirst({
            where: { workspaceId, title: { contains: String(raw.goalTitle).trim(), mode: "insensitive" } },
          });
        }

        if (!resolvedGoal && lastCreatedGoalId) {
          resolvedGoal = await prisma.goal.findUnique({ where: { id: lastCreatedGoalId } });
        }

        if (!resolvedGoal) {
          // Fall back to first active goal in workspace
          resolvedGoal = (await prisma.goal.findFirst({
            where: { workspaceId, status: "active" },
            orderBy: { createdAt: "asc" },
          })) || (await prisma.goal.findFirst({
            where: { workspaceId },
            orderBy: { createdAt: "asc" },
          }));
        }

        if (!resolvedGoal || resolvedGoal.workspaceId !== workspaceId) {
          executed.push({
            id: executionId,
            action: "create_milestone",
            entityType: "milestone",
            entityId: "",
            entityTitle: String(milestoneTitle),
            success: false,
            message: "Target goal not found in this workspace.",
            canUndo: false,
            appliedAt: new Date().toISOString(),
          });
          continue;
        }

        const lastMilestone = await prisma.milestone.findFirst({
          where: { goalId: resolvedGoal.id },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const nextOrder = (lastMilestone?.order ?? -1) + 1;

        const createdMilestone = await prisma.milestone.create({
          data: {
            goalId: resolvedGoal.id,
            title: String(milestoneTitle).trim(),
            description: raw.description ? String(raw.description).trim() : null,
            targetDate: raw.targetDate ? new Date(raw.targetDate) : null,
            status: "planned",
            order: nextOrder,
          },
        });

        // Register in newly created milestones maps
        newlyCreatedMilestones.set(createdMilestone.id, createdMilestone);
        newlyCreatedMilestones.set(createdMilestone.title.toLowerCase().trim(), createdMilestone);
        if (raw.id) newlyCreatedMilestones.set(String(raw.id).toLowerCase().trim(), createdMilestone);
        if (raw.tempId) newlyCreatedMilestones.set(String(raw.tempId).toLowerCase().trim(), createdMilestone);
        if (raw.milestoneId) newlyCreatedMilestones.set(String(raw.milestoneId).toLowerCase().trim(), createdMilestone);
        lastCreatedMilestoneId = createdMilestone.id;

        // Also create a board item for this milestone so it renders on the canvas
        await prisma.boardItem.create({
          data: {
            workspaceId,
            entityType: "milestone",
            linkedMilestoneId: createdMilestone.id,
            x: 100 + nextOrder * 40,
            y: 100 + nextOrder * 40,
            width: 240,
            height: 140,
          },
        }).catch(() => {});

        prisma.activityLog.create({
          data: {
            workspaceId,
            userId,
            entityType: "milestone",
            entityId: createdMilestone.id,
            action: "created",
            diff: { title: createdMilestone.title, goalId: resolvedGoal.id },
          },
        }).catch(() => {});

        // Support nested tasks directly inside create_milestone
        const nestedTasks = Array.isArray(raw.tasks)
          ? raw.tasks
          : Array.isArray(raw.suggestedTasks)
          ? raw.suggestedTasks
          : [];

        for (let i = 0; i < nestedTasks.length; i++) {
          const nt = nestedTasks[i];
          const ntTitle = typeof nt === "string" ? nt : nt.title || nt.taskTitle;
          if (!ntTitle) continue;

          const ntPriority =
            typeof nt === "object" &&
            nt.priority &&
            ["low", "medium", "high", "urgent"].includes(String(nt.priority).toLowerCase())
              ? (String(nt.priority).toLowerCase() as "low" | "medium" | "high" | "urgent")
              : "medium";

          const createdT = await prisma.task.create({
            data: {
              title: String(ntTitle).trim(),
              milestoneId: createdMilestone.id,
              workspaceId,
              priority: ntPriority,
              order: i,
              status: "todo",
            },
          });

          prisma.activityLog.create({
            data: {
              workspaceId,
              userId,
              entityType: "task",
              entityId: createdT.id,
              action: "created",
              diff: { title: createdT.title, milestoneId: createdMilestone.id },
            },
          }).catch(() => {});

          executed.push({
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            action: "create_task",
            entityType: "task",
            entityId: createdT.id,
            entityTitle: createdT.title,
            success: true,
            message: `Created task "${createdT.title}" under milestone "${createdMilestone.title}".`,
            details: {
              taskId: createdT.id,
              milestoneId: createdMilestone.id,
              milestoneTitle: createdMilestone.title,
              priority: createdT.priority,
            },
            undoData: { taskId: createdT.id },
            canUndo: true,
            appliedAt: new Date().toISOString(),
          });
        }

        executed.push({
          id: executionId,
          action: "create_milestone",
          entityType: "milestone",
          entityId: createdMilestone.id,
          entityTitle: createdMilestone.title,
          success: true,
          message: `Created milestone "${createdMilestone.title}" under goal "${resolvedGoal.title}".`,
          details: {
            milestoneId: createdMilestone.id,
            goalId: resolvedGoal.id,
            goalTitle: resolvedGoal.title,
          },
          undoData: { milestoneId: createdMilestone.id },
          canUndo: true,
          appliedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[executeBoardActions] Error applying action ${actionKey}:`, err);
      executed.push({
        id: executionId,
        action: actionKey as BoardActionType,
        entityType: "milestone",
        entityId: raw.id || "",
        entityTitle: raw.title || "Item",
        success: false,
        message: err instanceof Error ? err.message : "Failed to execute board action.",
        canUndo: false,
        appliedAt: new Date().toISOString(),
      });
    }
  }

  return executed;
}

/**
 * Undo an executed board action using its saved undoData snapshot.
 */
export async function undoBoardAction(
  workspaceId: string,
  userId: string,
  action: ExecutedBoardAction
): Promise<{ success: boolean; message: string }> {
  if (!action.canUndo || !action.undoData) {
    return { success: false, message: "This action cannot be undone." };
  }

  const { undoData, action: actionType } = action;

  try {
    if (actionType === "assign_task") {
      const taskId = String(undoData.taskId);
      const prevAssigneeId = (undoData.prevAssigneeId as string | null) || null;
      const prevName = String(undoData.prevAssigneeName || "Unassigned");

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { milestone: { select: { goal: { select: { workspaceId: true } } } } },
      });
      if (!task || task.milestone.goal.workspaceId !== workspaceId) {
        return { success: false, message: "Task no longer exists in this workspace." };
      }

      await prisma.task.update({
        where: { id: taskId },
        data: { assigneeId: prevAssigneeId },
      });

      return {
        success: true,
        message: `Reverted assignment on "${task.title}" back to ${prevName}.`,
      };
    }

    if (actionType === "update_task") {
      const taskId = String(undoData.taskId);
      const undoUpdates = (undoData.undoUpdates as Record<string, unknown>) || {};

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { milestone: { select: { goal: { select: { workspaceId: true } } } } },
      });
      if (!task || task.milestone.goal.workspaceId !== workspaceId) {
        return { success: false, message: "Task no longer exists in this workspace." };
      }

      const updatePayload: Record<string, unknown> = { ...undoUpdates };
      if ("dueDate" in undoUpdates) {
        updatePayload.dueDate = undoUpdates.dueDate ? new Date(String(undoUpdates.dueDate)) : null;
      }

      await prisma.task.update({
        where: { id: taskId },
        data: updatePayload as never,
      });

      if (undoUpdates.status) {
        syncMilestoneStatus(task.milestoneId).catch(() => {});
      }

      return {
        success: true,
        message: `Reverted changes on task "${task.title}".`,
      };
    }

    if (actionType === "update_milestone") {
      const milestoneId = String(undoData.milestoneId);
      const undoUpdates = (undoData.undoUpdates as Record<string, unknown>) || {};

      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        include: { goal: { select: { workspaceId: true } } },
      });
      if (!milestone || milestone.goal.workspaceId !== workspaceId) {
        return { success: false, message: "Milestone no longer exists in this workspace." };
      }

      const updatePayload: Record<string, unknown> = { ...undoUpdates };
      if ("targetDate" in undoUpdates) {
        updatePayload.targetDate = undoUpdates.targetDate ? new Date(String(undoUpdates.targetDate)) : null;
      }

      await prisma.milestone.update({
        where: { id: milestoneId },
        data: updatePayload as never,
      });

      return {
        success: true,
        message: `Reverted changes on milestone "${milestone.title}".`,
      };
    }

    if (actionType === "delete_milestone") {
      const ms = undoData.milestone as {
        id: string;
        goalId: string;
        title: string;
        description: string | null;
        status: "planned" | "in_progress" | "completed" | "delayed";
        targetDate: string | null;
        startDate: string | null;
        dependsOn: string[];
        order: number;
      };

      const tasks = (undoData.tasks as Array<{
        id: string;
        title: string;
        description: string | null;
        assigneeId: string | null;
        status: "todo" | "in_progress" | "in_review" | "blocked" | "done";
        priority: "low" | "medium" | "high" | "urgent";
        storyPoints: number | null;
        dueDate: string | null;
        order: number;
        workspaceId: string;
      }>) || [];

      // Check if goal still exists
      const goal = await prisma.goal.findUnique({
        where: { id: ms.goalId },
      });
      if (!goal || goal.workspaceId !== workspaceId) {
        return { success: false, message: "Parent goal no longer exists in this workspace." };
      }

      const restoredMilestone = await prisma.milestone.create({
        data: {
          id: ms.id,
          goalId: ms.goalId,
          title: ms.title,
          description: ms.description,
          status: ms.status,
          targetDate: ms.targetDate ? new Date(ms.targetDate) : null,
          startDate: ms.startDate ? new Date(ms.startDate) : null,
          dependsOn: ms.dependsOn,
          order: ms.order,
        },
      });

      // Restore tasks
      for (const t of tasks) {
        await prisma.task.create({
          data: {
            id: t.id,
            milestoneId: restoredMilestone.id,
            workspaceId: t.workspaceId,
            title: t.title,
            description: t.description,
            assigneeId: t.assigneeId,
            status: t.status,
            priority: t.priority,
            storyPoints: t.storyPoints,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            order: t.order,
          },
        }).catch(() => {});
      }

      // Re-create board item for restored milestone
      await prisma.boardItem.create({
        data: {
          workspaceId,
          entityType: "milestone",
          linkedMilestoneId: restoredMilestone.id,
          x: 100,
          y: 100,
          width: 240,
          height: 140,
        },
      }).catch(() => {});

      return {
        success: true,
        message: `Restored milestone "${restoredMilestone.title}" with ${tasks.length} task(s).`,
      };
    }

    if (actionType === "delete_task") {
      const t = undoData.task as {
        id: string;
        milestoneId: string;
        workspaceId: string;
        title: string;
        description: string | null;
        assigneeId: string | null;
        status: "todo" | "in_progress" | "in_review" | "blocked" | "done";
        priority: "low" | "medium" | "high" | "urgent";
        storyPoints: number | null;
        dueDate: string | null;
        order: number;
      };

      const milestone = await prisma.milestone.findUnique({
        where: { id: t.milestoneId },
        include: { goal: { select: { workspaceId: true } } },
      });
      if (!milestone || milestone.goal.workspaceId !== workspaceId) {
        return { success: false, message: "Parent milestone no longer exists in this workspace." };
      }

      await prisma.task.create({
        data: {
          id: t.id,
          milestoneId: t.milestoneId,
          workspaceId: t.workspaceId,
          title: t.title,
          description: t.description,
          assigneeId: t.assigneeId,
          status: t.status,
          priority: t.priority,
          storyPoints: t.storyPoints,
          dueDate: t.dueDate ? new Date(t.dueDate) : null,
          order: t.order,
        },
      });

      return {
        success: true,
        message: `Restored task "${t.title}".`,
      };
    }

    if (actionType === "create_task") {
      const taskId = String(undoData.taskId);
      await prisma.task.delete({ where: { id: taskId } }).catch(() => {});
      return { success: true, message: "Deleted created task." };
    }

    if (actionType === "create_milestone") {
      const milestoneId = String(undoData.milestoneId);
      await prisma.milestone.delete({ where: { id: milestoneId } }).catch(() => {});
      return { success: true, message: "Deleted created milestone." };
    }

    return { success: false, message: `Undo not implemented for action type ${actionType}.` };
  } catch (err) {
    console.error(`[undoBoardAction] Error reverting action ${actionType}:`, err);
    return {
      success: false,
      message: err instanceof Error ? err.message : "Failed to undo action.",
    };
  }
}
