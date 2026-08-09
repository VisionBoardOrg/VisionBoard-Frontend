import { MilestoneStatus, TaskStatus, Priority, GoalStatus, BoardEntityType } from "@prisma/client";

export interface TemplateData {
  goals: TemplateGoal[];
  sprints: TemplateSprint[];
}

interface TemplateGoal {
  title: string;
  objective: string;
  keyResults: KeyResult[];
  status: GoalStatus;
  targetDate: Date;
  milestones: TemplateMilestone[];
}

interface KeyResult {
  id: string;
  title: string;
  target: number;
  current: number;
  unit: string;
}

interface TemplateMilestone {
  title: string;
  description: string;
  status: MilestoneStatus;
  targetDate: Date;
  order: number;
  tasks: TemplateTask[];
}

interface TemplateTask {
  title: string;
  status: TaskStatus;
  priority: Priority;
  storyPoints: number;
  order: number;
}

interface TemplateSprint {
  name: string;
  startDate: Date;
  endDate: Date;
  velocity: number;
}

const now = new Date();
const weeks = (n: number) => new Date(now.getTime() + n * 7 * 24 * 60 * 60 * 1000);

// ──────────────────────────────────────────────────────────
// OKR BOARD
// ──────────────────────────────────────────────────────────
export const okrBoardTemplate: TemplateData = {
  sprints: [],
  goals: [
    {
      title: "Q3 Growth OKR",
      objective: "Achieve product-market fit and drive user growth in Q3",
      status: "active",
      targetDate: weeks(12),
      keyResults: [
        { id: "kr1", title: "Reach 10,000 MAU", target: 10000, current: 2400, unit: "users" },
        { id: "kr2", title: "NPS score ≥ 50", target: 50, current: 38, unit: "score" },
        { id: "kr3", title: "Reduce churn to < 3%", target: 3, current: 6.2, unit: "%" },
      ],
      milestones: [
        {
          title: "User Research Sprint",
          description: "Conduct 20 user interviews and synthesize insights",
          status: "completed",
          targetDate: weeks(-2),
          order: 0,
          tasks: [
            { title: "Schedule 20 user interviews", status: "done", priority: "high", storyPoints: 2, order: 0 },
            { title: "Create interview script", status: "done", priority: "medium", storyPoints: 1, order: 1 },
            { title: "Synthesize findings into themes", status: "done", priority: "high", storyPoints: 3, order: 2 },
          ],
        },
        {
          title: "Feature Prioritization",
          description: "Score and rank top 10 feature requests against OKRs",
          status: "in_progress",
          targetDate: weeks(2),
          order: 1,
          tasks: [
            { title: "Build RICE scoring model", status: "done", priority: "high", storyPoints: 2, order: 0 },
            { title: "Score Q3 feature backlog", status: "in_progress", priority: "high", storyPoints: 3, order: 1 },
            { title: "Align with engineering capacity", status: "todo", priority: "medium", storyPoints: 2, order: 2 },
          ],
        },
        {
          title: "Q3 Launch Execution",
          description: "Ship 3 top-scored features and run growth experiment",
          status: "planned",
          targetDate: weeks(10),
          order: 2,
          tasks: [
            { title: "Define success metrics per feature", status: "todo", priority: "high", storyPoints: 2, order: 0 },
            { title: "Coordinate go-to-market with marketing", status: "todo", priority: "medium", storyPoints: 3, order: 1 },
            { title: "Set up analytics dashboards", status: "todo", priority: "medium", storyPoints: 2, order: 2 },
          ],
        },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────
// PRODUCT ROADMAP
// ──────────────────────────────────────────────────────────
export const productRoadmapTemplate: TemplateData = {
  sprints: [
    { name: "Sprint 1 — Discovery", startDate: weeks(-4), endDate: weeks(-2), velocity: 24 },
    { name: "Sprint 2 — Core Build", startDate: weeks(-2), endDate: weeks(0), velocity: 30 },
    { name: "Sprint 3 — Alpha", startDate: weeks(0), endDate: weeks(2), velocity: 28 },
    { name: "Sprint 4 — Beta", startDate: weeks(2), endDate: weeks(4), velocity: 32 },
  ],
  goals: [
    {
      title: "Product Roadmap H2",
      objective: "Deliver a best-in-class v2.0 product that drives expansion revenue",
      status: "active",
      targetDate: weeks(24),
      keyResults: [
        { id: "kr1", title: "Ship 5 major features", target: 5, current: 2, unit: "features" },
        { id: "kr2", title: "Achieve 85% feature adoption within 30 days", target: 85, current: 0, unit: "%" },
        { id: "kr3", title: "Expand ARR by 40%", target: 40, current: 12, unit: "%" },
      ],
      milestones: [
        {
          title: "Feedback → Feature Mapping",
          description: "Link all customer feedback to specific roadmap features",
          status: "completed",
          targetDate: weeks(-4),
          order: 0,
          tasks: [
            { title: "Export Intercom feedback", status: "done", priority: "high", storyPoints: 1, order: 0 },
            { title: "Tag and cluster by theme", status: "done", priority: "high", storyPoints: 3, order: 1 },
            { title: "Map to PRD feature list", status: "done", priority: "medium", storyPoints: 2, order: 2 },
          ],
        },
        {
          title: "Core Platform v2",
          description: "Rebuild core data layer for performance and scalability",
          status: "in_progress",
          targetDate: weeks(4),
          order: 1,
          tasks: [
            { title: "Design new data schema", status: "done", priority: "urgent", storyPoints: 5, order: 0 },
            { title: "Migrate existing data", status: "in_progress", priority: "urgent", storyPoints: 8, order: 1 },
            { title: "Performance testing", status: "todo", priority: "high", storyPoints: 5, order: 2 },
            { title: "Rollback plan", status: "todo", priority: "high", storyPoints: 3, order: 3 },
          ],
        },
        {
          title: "Beta Release",
          description: "Open beta to 500 users and gather structured feedback",
          status: "planned",
          targetDate: weeks(8),
          order: 2,
          tasks: [
            { title: "Set up beta invite flow", status: "todo", priority: "high", storyPoints: 3, order: 0 },
            { title: "Create in-app feedback widget", status: "todo", priority: "medium", storyPoints: 3, order: 1 },
            { title: "Draft beta release notes", status: "todo", priority: "low", storyPoints: 1, order: 2 },
          ],
        },
        {
          title: "GA Launch",
          description: "Full general availability launch with marketing push",
          status: "planned",
          targetDate: weeks(16),
          order: 3,
          tasks: [
            { title: "Pricing page update", status: "todo", priority: "high", storyPoints: 2, order: 0 },
            { title: "Press kit and launch blog", status: "todo", priority: "medium", storyPoints: 3, order: 1 },
            { title: "Sales enablement deck", status: "todo", priority: "medium", storyPoints: 2, order: 2 },
          ],
        },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────
// QUARTERLY PLAN
// ──────────────────────────────────────────────────────────
export const quarterlyPlanTemplate: TemplateData = {
  sprints: [],
  goals: [
    {
      title: "Q3 Engineering Goals",
      objective: "Improve platform reliability and enable the team to ship faster",
      status: "active",
      targetDate: weeks(12),
      keyResults: [
        { id: "kr1", title: "99.9% uptime", target: 99.9, current: 99.2, unit: "%" },
        { id: "kr2", title: "Deploy frequency: 2x/day", target: 2, current: 0.8, unit: "deploys/day" },
        { id: "kr3", title: "P95 API latency < 200ms", target: 200, current: 340, unit: "ms" },
      ],
      milestones: [
        {
          title: "Infrastructure Hardening",
          description: "Set up auto-scaling, circuit breakers, and alerting",
          status: "in_progress",
          targetDate: weeks(4),
          order: 0,
          tasks: [
            { title: "Set up PagerDuty alerts", status: "done", priority: "urgent", storyPoints: 2, order: 0 },
            { title: "Configure auto-scaling rules", status: "in_progress", priority: "high", storyPoints: 5, order: 1 },
            { title: "Load test at 10x traffic", status: "todo", priority: "high", storyPoints: 5, order: 2 },
          ],
        },
        {
          title: "CI/CD Pipeline Overhaul",
          description: "Cut deploy time from 45 min to under 10 min",
          status: "planned",
          targetDate: weeks(8),
          order: 1,
          tasks: [
            { title: "Audit current pipeline bottlenecks", status: "todo", priority: "high", storyPoints: 3, order: 0 },
            { title: "Parallelize test suites", status: "todo", priority: "high", storyPoints: 5, order: 1 },
            { title: "Implement canary deployments", status: "todo", priority: "medium", storyPoints: 8, order: 2 },
          ],
        },
      ],
    },
    {
      title: "Q3 Marketing Goals",
      objective: "Drive top-of-funnel awareness and convert waitlist to paid",
      status: "active",
      targetDate: weeks(12),
      keyResults: [
        { id: "kr1", title: "10,000 website visits/month", target: 10000, current: 3200, unit: "visits" },
        { id: "kr2", title: "500 waitlist sign-ups", target: 500, current: 180, unit: "sign-ups" },
        { id: "kr3", title: "25% waitlist → paid conversion", target: 25, current: 0, unit: "%" },
      ],
      milestones: [
        {
          title: "Content Engine",
          description: "Establish weekly content cadence: 2 blog posts, 5 tweets, 1 newsletter",
          status: "in_progress",
          targetDate: weeks(2),
          order: 0,
          tasks: [
            { title: "Create content calendar", status: "done", priority: "high", storyPoints: 2, order: 0 },
            { title: "Write 4 SEO landing pages", status: "in_progress", priority: "high", storyPoints: 6, order: 1 },
            { title: "Set up newsletter automation", status: "todo", priority: "medium", storyPoints: 3, order: 2 },
          ],
        },
      ],
    },
  ],
};

// ──────────────────────────────────────────────────────────
// SPRINT BOARD
// ──────────────────────────────────────────────────────────
export const sprintBoardTemplate: TemplateData = {
  sprints: [
    { name: "Sprint 12 — Auth & Onboarding", startDate: weeks(-1), endDate: weeks(1), velocity: 34 },
    { name: "Sprint 13 — Dashboard & Reports", startDate: weeks(1), endDate: weeks(3), velocity: 30 },
    { name: "Sprint 14 — Board Canvas", startDate: weeks(3), endDate: weeks(5), velocity: 28 },
  ],
  goals: [
    {
      title: "Sprint 12 Goal",
      objective: "Ship a polished auth and onboarding experience for beta users",
      status: "active",
      targetDate: weeks(1),
      keyResults: [
        { id: "kr1", title: "Story points completed", target: 34, current: 21, unit: "pts" },
        { id: "kr2", title: "0 P0 bugs in auth flow", target: 0, current: 0, unit: "bugs" },
      ],
      milestones: [
        {
          title: "Authentication",
          description: "Email + Google OAuth, session management, protected routes",
          status: "in_progress",
          targetDate: weeks(0),
          order: 0,
          tasks: [
            { title: "NextAuth credentials provider", status: "done", priority: "urgent", storyPoints: 5, order: 0 },
            { title: "Google OAuth integration", status: "done", priority: "high", storyPoints: 3, order: 1 },
            { title: "Protected route middleware", status: "in_progress", priority: "high", storyPoints: 3, order: 2 },
            { title: "Session refresh logic", status: "todo", priority: "medium", storyPoints: 2, order: 3 },
          ],
        },
        {
          title: "Onboarding Flow",
          description: "Role picker + template selector + workspace creation",
          status: "planned",
          targetDate: weeks(1),
          order: 1,
          tasks: [
            { title: "Role picker UI", status: "in_progress", priority: "high", storyPoints: 3, order: 0 },
            { title: "Template preview cards", status: "todo", priority: "high", storyPoints: 5, order: 1 },
            { title: "Workspace creation API", status: "todo", priority: "high", storyPoints: 5, order: 2 },
            { title: "Sample data seeding", status: "todo", priority: "medium", storyPoints: 5, order: 3 },
            { title: "Onboarding completion redirect", status: "todo", priority: "low", storyPoints: 1, order: 4 },
          ],
        },
      ],
    },
  ],
};

export type TemplateName = "okr_board" | "product_roadmap" | "quarterly_plan" | "sprint_board" | "blank";

// ──────────────────────────────────────────────────────────
// BLANK TEMPLATE — completely empty workspace, no seeded data
// ──────────────────────────────────────────────────────────
export const blankTemplate: TemplateData = {
  goals: [],
  sprints: [],
};

export const TEMPLATES: Record<TemplateName, { name: string; description: string; icon: string; data: TemplateData }> = {
  blank: {
    name: "Blank",
    description: "Start with a completely empty workspace — no pre-added goals, tasks, or sprints",
    icon: "LayoutTemplate",
    data: blankTemplate,
  },
  okr_board: {
    name: "OKR Board",
    description: "Set objectives, define measurable key results, track quarterly progress",
    icon: "Target",
    data: okrBoardTemplate,
  },
  product_roadmap: {
    name: "Product Roadmap",
    description: "Connect customer feedback to features to release milestones",
    icon: "Map",
    data: productRoadmapTemplate,
  },
  quarterly_plan: {
    name: "Quarterly Plan",
    description: "Map team goals to resource allocation and bandwidth across the quarter",
    icon: "ClipboardList",
    data: quarterlyPlanTemplate,
  },
  sprint_board: {
    name: "Sprint Board",
    description: "Agile execution board with velocity tracking and standup summaries",
    icon: "Zap",
    data: sprintBoardTemplate,
  },
};
