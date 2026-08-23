import type { WorkspaceMember } from "@prisma/client";

/**
 * Safe user shape passed to client dashboard components — never include the
 * full Prisma User (it carries hashedPassword and Stripe billing fields).
 */
export type DashboardUser = { id: string; name: string | null; email: string; image: string | null };

export type DashboardMember = WorkspaceMember & { user: DashboardUser };

/**
 * Slim task projection — status/assignee everywhere; title/priority/storyPoints
 * only on sprint tasks (Eng dashboard list + velocity math).
 */
export type DashboardTask = {
  id: string;
  status: string;
  assigneeId: string | null;
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

export type DashboardSprint = {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
  tasks: DashboardTask[];
};

/** Slim workspace graph consumed by the role dashboards (PM/Exec/Eng/Marketing). */
export type DashboardWorkspace = {
  id: string;
  name: string;
  goals: DashboardGoal[];
  sprints: DashboardSprint[];
  members: DashboardMember[];
  _count: { goals: number; documents: number; members: number };
};
