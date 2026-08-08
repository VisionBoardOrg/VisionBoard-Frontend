# Requirements Document

## Introduction

This document defines requirements for the user dashboard and workspaces feature in VisionBoard, a Next.js/Prisma-based project management platform. The feature covers four areas: post-registration redirect to a personalised dashboard, a workspaces list page with workspace-scoped task views, tiered workspace creation quotas by plan, and blank-template workspace initialisation.

The codebase already contains partial implementations (e.g., `app/dashboard/page.tsx`, `app/workspaces/page.tsx`, `lib/plan-limits.ts`, `lib/templates/index.ts`). These requirements define the complete, correct behaviour that all implementations — new and existing — must satisfy.

## Glossary

- **Dashboard**: The `/dashboard` page that displays user-specific summary data after sign-in or sign-up.
- **User**: An authenticated person with a record in the `User` model.
- **Workspace**: A collaborative environment modelled by the `Workspace` model, owned by one `User` and accessed by zero or more `WorkspaceMember` records.
- **Owned Workspace**: A workspace whose `ownerId` matches the current `User.id`.
- **Member Workspace**: A workspace in which the user has a `WorkspaceMember` record but is not the owner.
- **Task**: A `Task` model record linked through `Milestone → Goal → Workspace`; may carry an `assigneeId` pointing to the current user.
- **Assigned Task**: A `Task` whose `assigneeId` equals the current `User.id`.
- **Task Completion Rate**: The ratio of assigned tasks with `status = "done"` to total assigned tasks, expressed as a percentage rounded to one decimal place.
- **Plan**: The `PlanTier` enum value (`free`, `startup`, `growth`, `enterprise`) stored on a `Workspace` record.
- **Basic Plan**: The `free` `PlanTier`.
- **Paid Plan**: Any `PlanTier` other than `free` (`startup`, `growth`, `enterprise`).
- **Workspace Quota**: The maximum number of workspaces a user may own, as defined in `PLAN_LIMITS[plan].workspaces`.
- **Blank Template**: A workspace creation option that seeds no goals, milestones, tasks, sprints, or board items — resulting in a completely empty workspace.
- **Navigation Menu**: The sidebar navigation rendered by `AppShell`, containing links to dashboard, workspace views, workspaces list, account, and sign-out.
- **Registration**: The process of creating a new `User` account via `/api/auth/register` or OAuth.
- **Onboarding**: The multi-step flow at `/onboarding` where a new user selects a role, template, and workspace name before their first workspace is created.
- **Auth_System**: The Next.js/NextAuth authentication layer (`lib/auth`).
- **Dashboard_Page**: The server component at `app/dashboard/page.tsx`.
- **Workspaces_Page**: The server component at `app/workspaces/page.tsx` backed by `WorkspacesClient`.
- **Workspace_API**: The API routes under `app/api/workspaces/`.
- **Plan_Limit_Service**: The `checkPlanLimit` function in `lib/plan-limits.ts`.
- **Seed_Service**: The `seedWorkspace` function in `lib/seed-workspace.ts`.
- **Template_Registry**: The `TEMPLATES` map in `lib/templates/index.ts`.

---

## Requirements

### Requirement 1: Post-Registration Redirect to Dashboard

**User Story:** As a new user, I want to be automatically taken to my personalised dashboard after completing account creation, so that I can immediately see my workspace context without navigating manually.

#### Acceptance Criteria

1. WHEN a user completes email/password registration via `/api/auth/register` and is subsequently signed in, THE Auth_System SHALL redirect the user to `/dashboard`.
2. WHEN a user completes OAuth registration (Google), THE Auth_System SHALL redirect the user to `/dashboard`.
3. WHEN the user has no workspace membership at the time `/dashboard` is first loaded, THE Dashboard_Page SHALL redirect the user to `/onboarding` so they can create their first workspace.
4. WHEN the user has at least one workspace membership, THE Dashboard_Page SHALL render the dashboard for the user's most recently joined workspace without redirecting to `/onboarding`.
5. IF the session is absent or invalid when `/dashboard` is requested, THEN THE Dashboard_Page SHALL redirect the user to `/auth/login`.

---

### Requirement 2: Dashboard Content — Profile and Summary Widgets

**User Story:** As an authenticated user, I want my dashboard to display my profile information, workspace count, assigned tasks, and task completion rate, so that I can understand my workload and progress at a glance.

#### Acceptance Criteria

1. THE Dashboard_Page SHALL display the authenticated user's display name retrieved from `User.name`.
2. THE Dashboard_Page SHALL display the authenticated user's email address retrieved from `User.email`.
3. THE Dashboard_Page SHALL display the total count of workspaces the user belongs to, computed as the number of distinct `WorkspaceMember` records whose `userId` matches the current user.
4. THE Dashboard_Page SHALL display the total count of tasks assigned to the current user, computed as the number of `Task` records whose `assigneeId` matches the current user across all workspaces the user is a member of.
5. THE Dashboard_Page SHALL display the task completion rate, computed as `(count of assigned tasks with status = "done") / (total assigned tasks) × 100`, rounded to one decimal place.
6. IF the user has zero assigned tasks, THEN THE Dashboard_Page SHALL display a task completion rate of 0.0%.
7. THE Dashboard_Page SHALL render the Navigation Menu for authenticated users via the `AppShell` component.

---

### Requirement 3: Dashboard Navigation Menu

**User Story:** As an authenticated user, I want a navigation menu with account management options, so that I can access all platform areas and manage my account from the dashboard.

#### Acceptance Criteria

1. THE Navigation_Menu SHALL include a link to `/dashboard` labelled "Dashboard".
2. THE Navigation_Menu SHALL include a link to the active workspace's board view at `/workspace/{workspaceId}/board`.
3. THE Navigation_Menu SHALL include a link to `/workspaces` labelled "Workspaces".
4. THE Navigation_Menu SHALL include a link to `/account` labelled "Account".
5. THE Navigation_Menu SHALL include a sign-out action that, when activated, calls `signOut` and redirects the user to `/auth/login`.
6. WHILE the user is viewing a page whose path matches a navigation item's `href`, THE Navigation_Menu SHALL render that item in its active/highlighted state.

---

### Requirement 4: Workspaces Page — List View

**User Story:** As an authenticated user, I want to see all workspaces I belong to on a dedicated page, so that I can quickly navigate between teams and projects.

#### Acceptance Criteria

1. THE Workspaces_Page SHALL display all workspaces where the current user has a `WorkspaceMember` record, including both owned and member workspaces.
2. THE Workspaces_Page SHALL display for each workspace: workspace name, plan badge, the user's role in that workspace, an owner indicator (if the user is the owner), member count, goal count, and document count.
3. THE Workspaces_Page SHALL display the count of workspaces the user owns alongside the user's plan workspace quota (e.g., "2 of 5 owned workspaces used on the Startup plan").
4. WHEN the user clicks the "Open" action on a workspace card, THE Workspaces_Page SHALL navigate to `/workspace/{workspaceId}/board`.
5. IF no workspaces exist for the user, THEN THE Workspaces_Page SHALL render an empty-state message with a prompt to create the first workspace.
6. IF the session is absent when `/workspaces` is requested, THEN THE Workspaces_Page SHALL redirect to `/auth/login`.

---

### Requirement 5: Workspaces Page — Workspace-Scoped Task View

**User Story:** As an authenticated user, I want to click into a workspace and view only the tasks associated with that workspace, so that I can focus on the work relevant to that context.

#### Acceptance Criteria

1. WHEN a user navigates to `/workspace/{workspaceId}/tasks`, THE Workspace_API SHALL return only `Task` records that belong to milestones scoped to goals within the specified workspace.
2. THE tasks view at `/workspace/{workspaceId}/tasks` SHALL display the task title, status, priority, and assignee name for each task in the workspace.
3. WHILE viewing the tasks for a specific workspace, THE Navigation_Menu SHALL highlight the "My Tasks" link as active.
4. IF the user is not a member of the specified workspace, THEN THE Dashboard_Page SHALL return a 403 response or redirect to `/dashboard`.

---

### Requirement 6: Workspace Creation — Tiered Quota Enforcement

**User Story:** As a platform operator, I want workspace creation to be limited according to each user's plan tier, so that resource usage is aligned with subscription value.

#### Acceptance Criteria

1. WHEN a user on the `free` plan attempts to create a workspace and already owns 1 or more workspaces, THE Workspace_API SHALL return a 403 response with a message indicating the plan limit has been reached.
2. WHEN a user on the `free` plan owns zero workspaces, THE Workspace_API SHALL allow the creation of exactly 1 workspace.
3. WHEN a user on the `startup` plan attempts to create a workspace and already owns 5 or more workspaces, THE Workspace_API SHALL return a 403 response with a message indicating the plan limit has been reached.
4. WHEN a user on the `growth` plan or `enterprise` plan attempts to create a workspace, THE Workspace_API SHALL allow workspace creation without a quota restriction on owned workspaces.
5. WHEN any plan-tier user is invited to a workspace as a member, THE Workspace_API SHALL allow the user to join the workspace regardless of how many workspaces the user already owns.
6. THE Plan_Limit_Service SHALL evaluate only owned workspaces (where `Workspace.ownerId = user.id`) when checking the `create_workspace` quota; member workspaces SHALL NOT count toward the creation limit.
7. IF a 403 response is returned due to quota exhaustion, THEN THE Workspace_API SHALL include an `upgradePrompt` field in the response body directing the user to upgrade their plan.

---

### Requirement 7: Workspace Initialization — Blank Template

**User Story:** As a user creating a new workspace, I want the option to start with a completely empty workspace, so that I can build my own structure without removing pre-seeded sample data.

#### Acceptance Criteria

1. THE Template_Registry SHALL include a `blank` template option with the name "Blank", a description indicating it starts with no content, and an empty `goals` array and empty `sprints` array.
2. WHEN a workspace is created using the `blank` template, THE Seed_Service SHALL create the workspace and its owner `WorkspaceMember` record but SHALL NOT create any `Goal`, `Milestone`, `Task`, `Sprint`, or `BoardItem` records.
3. THE Workspaces_Page creation modal SHALL display the `blank` template as a selectable option alongside the existing templates.
4. THE Onboarding flow at `/onboarding` SHALL display the `blank` template as a selectable option in the template selection step.
5. WHEN the `blank` template is selected, THE Dashboard_Page (or workspace board view after creation) SHALL render an empty-state indicator prompting the user to create their first goal or task.

---

### Requirement 8: Workspace Creation — Consistent Post-Creation Redirect

**User Story:** As a user who has just created a workspace, I want to be taken directly to the new workspace, so that I can start working without extra navigation steps.

#### Acceptance Criteria

1. WHEN a workspace is successfully created via the Workspaces_Page modal, THE Workspaces_Page SHALL navigate the user to `/workspace/{newWorkspaceId}/board`.
2. WHEN a workspace is successfully created via the Onboarding flow, THE Onboarding flow SHALL navigate the user to `/workspace/{newWorkspaceId}/board`.
3. WHEN a workspace creation request fails due to a plan limit, THE Workspace_API SHALL return a 403 response and THE UI SHALL display the error message without navigating away from the current page.
