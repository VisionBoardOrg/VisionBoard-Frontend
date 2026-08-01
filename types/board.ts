// Board-related TypeScript types shared between server and client

export interface BoardItemFull {
  id: string;
  workspaceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  entityType: "goal" | "milestone" | "task" | "note";
  color: string | null;
  label: string | null;
  linkedGoalId: string | null;
  linkedMilestoneId: string | null;
  linkedTaskId: string | null;
  linkedGoal: GoalSimple | null;
  linkedMilestone: MilestoneWithTasks | null;
}

export interface GoalSimple {
  id: string;
  title: string;
  objective: string;
  status: string;
  healthScore: number;
  targetDate: Date | null;
}

export interface MilestoneWithTasks {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  status: string;
  targetDate: Date | null;
  tasks: TaskSimple[];
}

export interface TaskSimple {
  id: string;
  title: string;
  status: string;
  priority: string;
  storyPoints: number | null;
  assigneeId: string | null;
}

export interface UserSimple {
  id: string;
  name: string | null;
  image: string | null;
}

export interface AIBoardAction {
  action: "update" | "move" | "assign" | "create";
  entity: "milestone" | "task" | "goal";
  id?: string;
  changes: Record<string, unknown>;
  description: string; // human-readable summary for confirmation UI
}
