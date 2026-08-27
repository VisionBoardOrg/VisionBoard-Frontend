import { prisma } from "@/lib/prisma";

const STARTED_STATUSES = new Set(["done", "in_progress", "in_review"]);

/**
 * Recompute and persist a milestone's status from its tasks.
 * Returns the new status, or null when the milestone has no tasks
 * (stored status is left untouched in that case).
 */
export async function syncMilestoneStatus(milestoneId: string): Promise<"planned" | "in_progress" | "completed" | null> {
  const tasks = await prisma.task.findMany({
    where: { milestoneId },
    select: { status: true },
  });
  if (tasks.length === 0) return null;

  const allDone = tasks.every((t) => t.status === "done");
  const anyStarted = tasks.some((t) => STARTED_STATUSES.has(t.status));
  const target = allDone ? "completed" : anyStarted ? "in_progress" : "planned";

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: target },
  });
  return target;
}
