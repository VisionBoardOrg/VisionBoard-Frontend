import { Goal, Milestone, Task } from "@prisma/client";

type GoalWithRelations = Goal & {
  milestones: (Milestone & { tasks: Task[] })[];
};

/** Compute a Goal Health Score 0-100 */
export function computeGoalHealth(goal: GoalWithRelations): number {
  const allTasks = goal.milestones.flatMap((m) => m.tasks);
  if (allTasks.length === 0) return 0;

  const doneTasks = allTasks.filter((t) => t.status === "done").length;
  const taskProgress = (doneTasks / allTasks.length) * 100;

  // Penalise for blocked tasks
  const blockedTasks = allTasks.filter((t) => t.status === "blocked").length;
  const blockPenalty = Math.min(blockedTasks * 10, 30);

  // Penalise for overdue milestones
  const now = new Date();
  const overdueMilestones = goal.milestones.filter(
    (m) => m.targetDate && new Date(m.targetDate) < now && m.status !== "completed"
  ).length;
  const overduePenalty = Math.min(overdueMilestones * 15, 30);

  const score = Math.max(0, Math.round(taskProgress - blockPenalty - overduePenalty));
  return Math.min(100, score);
}

/** Sprint velocity helpers */
export function computeSprintVelocity(tasks: Task[]) {
  const planned = tasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const completed = tasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  return { planned, completed };
}

/** Count tasks by status */
export function taskStatusCounts(tasks: Task[]) {
  return {
    todo: tasks.filter((t) => t.status === "todo").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    in_review: tasks.filter((t) => t.status === "in_review").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
}
