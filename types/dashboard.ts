import type { WorkspaceMember } from "@prisma/client";

/**
 * Safe user shape passed to client dashboard components — never include the
 * full Prisma User (it carries hashedPassword and Stripe billing fields).
 */
export type DashboardUser = { id: string; name: string | null; email: string; image: string | null };

export type DashboardMember = WorkspaceMember & { user: DashboardUser };

/**
 * Slim task projection — status/assignees everywhere; title/priority/storyPoints
 * for task list and milestone progress displays.
 */
export type DashboardTask = {
  id: string;
  status: string;
  assignees: { userId: string; role: string }[];
  title?: string;
  priority?: string;
  storyPoints?: number | null;
};

export type DashboardMilestone = {
  id: string;
  title: string;
  status: string;
  targetDate: Date | null;
  tasks: DashboardTask[];
};

export type DashboardGoal = {
  id: string;
  title: string;
  status: string;
  /** Persisted health score — maintained by the sweeper cron, not recomputed client-side. */
  healthScore: number;
  targetDate: Date | null;
  milestones: DashboardMilestone[];
};

/** Pre-aggregated task counts by status (matches lib/dashboard-utils.ts). */
export type DashboardTaskStatusCounts = {
  todo: number;
  in_progress: number;
  in_review: number;
  blocked: number;
  done: number;
};

/** Slim assigned-task row for EngDashboard's "My tasks" card. */
export type DashboardMyTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
};

/** Pre-aggregated task counts computed server-side for overview dashboards. */
export type DashboardTaskStats = {
  total: number;
  done: number;
  blocked: number;
  byStatus?: DashboardTaskStatusCounts;
};

/** Slim workspace graph consumed by the role dashboards (PM/Exec/Eng/Marketing). */
export type DashboardWorkspace = {
  id: string;
  name: string;
  goals: DashboardGoal[];
  members: DashboardMember[];
  _count: { goals: number; documents: number; members: number };
  taskStats?: DashboardTaskStats;
  /** Pre-filtered tasks assigned to the active user (top 6) for EngDashboard. */
  myTasks?: DashboardMyTask[];
  /** Total count of tasks assigned to the active user in this workspace. */
  myTasksTotal?: number;
};
