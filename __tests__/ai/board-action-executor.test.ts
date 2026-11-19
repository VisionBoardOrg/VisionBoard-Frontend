import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeBoardActions, undoBoardAction } from "@/lib/ai/board-action-executor";
import { prisma } from "@/lib/prisma";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    taskAssignment: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    milestone: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    goal: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    boardItem: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    activityLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/milestone-sync", () => ({
  syncMilestoneStatus: vi.fn().mockResolvedValue("planned"),
}));

vi.mock("@/lib/goal-health", () => ({
  calculateGoalHealth: vi.fn().mockResolvedValue(100),
}));

vi.mock("@/lib/notifications", () => ({
  dispatchTaskAssignmentNotification: vi.fn().mockResolvedValue(undefined),
}));

describe("board-action-executor", () => {
  const workspaceId = "ws-test-123";
  const userId = "usr-owner-1";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      name: "Owner User",
      email: "owner@test.com",
    } as never);
    // Assignment plumbing defaults — individual tests override as needed.
    vi.mocked(prisma.taskAssignment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.taskAssignment.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.taskAssignment.createMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.taskAssignment.update).mockResolvedValue({} as never);
    vi.mocked(prisma.workspaceMember.count).mockResolvedValue(1 as never);
    vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  describe("executeBoardActions", () => {
    it("deletes milestone and captures undo snapshot with tasks", async () => {
      vi.mocked(prisma.milestone.findUnique).mockResolvedValue({
        id: "ms-1",
        goalId: "goal-1",
        title: "Community Setup & Planning",
        description: "Initial planning",
        status: "planned",
        targetDate: new Date("2026-10-01"),
        startDate: null,
        dependsOn: [],
        order: 1,
        goal: { workspaceId, title: "Product Launch" },
        tasks: [
          {
            id: "task-1",
            title: "Setup forum",
            description: null,
            assignees: [],
            status: "todo",
            priority: "medium",
            storyPoints: 3,
            dueDate: null,
            order: 0,
            workspaceId,
          },
        ],
      } as never);

      vi.mocked(prisma.milestone.delete).mockResolvedValue({ id: "ms-1" } as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          action: "delete_milestone",
          milestoneId: "ms-1",
          title: "Community Setup & Planning",
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].action).toBe("delete_milestone");
      expect(results[0].message).toContain("Community Setup & Planning");
      expect(results[0].canUndo).toBe(true);
      expect(results[0].undoData?.milestone).toBeDefined();
      expect(prisma.milestone.delete).toHaveBeenCalledWith({ where: { id: "ms-1" } });
    });

    it("rejects milestone deletion if it belongs to a different workspace", async () => {
      vi.mocked(prisma.milestone.findUnique).mockResolvedValue({
        id: "ms-other",
        goalId: "goal-2",
        title: "Other Workspace Milestone",
        goal: { workspaceId: "ws-other-999", title: "Other Goal" },
        tasks: [],
      } as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          action: "delete_milestone",
          milestoneId: "ms-other",
          title: "Other Workspace Milestone",
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].message).toContain("not found in this workspace");
      expect(prisma.milestone.delete).not.toHaveBeenCalled();
    });

    it("assigns task to a workspace member and records previous assignee for undo", async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: "task-skill-1",
        title: "Skill Development",
        assignees: [],
        milestoneId: "ms-dev",
        milestone: {
          id: "ms-dev",
          title: "Core Training",
          goal: { workspaceId },
        },
      } as never);

      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        { userId: "usr-grace", user: { id: "usr-grace", name: "Grace", email: "grace@test.com" } },
      ] as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          // Legacy scalar input — must still resolve to a single owner.
          action: "assign_task",
          taskId: "task-skill-1",
          taskTitle: "Skill Development",
          assigneeId: "usr-grace",
          assigneeName: "Grace",
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].action).toBe("assign_task");
      expect(results[0].message).toContain("Assigned Grace to \"Skill Development\"");
      expect(results[0].undoData?.prevAssignees).toEqual([]);
      expect(prisma.taskAssignment.createMany).toHaveBeenCalledWith({
        data: [{ taskId: "task-skill-1", userId: "usr-grace", role: "owner" }],
        skipDuplicates: true,
      });
    });

    it("handles multi-action commands (delete milestone AND assign task together)", async () => {
      // Milestone setup
      vi.mocked(prisma.milestone.findUnique).mockResolvedValue({
        id: "ms-community",
        goalId: "goal-1",
        title: "Community Setup & Planning",
        description: null,
        status: "planned",
        targetDate: null,
        startDate: null,
        dependsOn: [],
        order: 0,
        goal: { workspaceId, title: "Launch" },
        tasks: [],
      } as never);
      vi.mocked(prisma.milestone.delete).mockResolvedValue({ id: "ms-community" } as never);

      // Task setup
      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: "task-skill-1",
        title: "Skill Development",
        assignees: [],
        milestoneId: "ms-training",
        milestone: {
          id: "ms-training",
          title: "Training",
          goal: { workspaceId },
        },
      } as never);

      vi.mocked(prisma.workspaceMember.findMany).mockResolvedValue([
        { userId: "usr-grace", user: { id: "usr-grace", name: "Grace", email: "grace@test.com" } },
      ] as never);
      vi.mocked(prisma.task.update).mockResolvedValue({ id: "task-skill-1" } as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          action: "delete_milestone",
          milestoneId: "ms-community",
          title: "Community Setup & Planning",
        },
        {
          // New-style input exercising the `assignees` array path.
          action: "assign_task",
          taskId: "task-skill-1",
          taskTitle: "Skill Development",
          assignees: [{ userId: "usr-grace", role: "owner" }],
        },
      ]);

      expect(results).toHaveLength(2);
      // Priority sorts assignments (priority 4) before deletions (priority 6)
      expect(results[0].success).toBe(true);
      expect(results[0].action).toBe("assign_task");
      expect(results[1].success).toBe(true);
      expect(results[1].action).toBe("delete_milestone");
    });

    it("creates milestone and subsequent tasks referencing it via milestoneTitle", async () => {
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({
        id: "goal-dev",
        title: "Developer Ecosystem",
        workspaceId,
        status: "active",
      } as never);

      vi.mocked(prisma.milestone.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.milestone.create).mockResolvedValue({
        id: "ms-devfest-123",
        title: "Host DevFest Fuoye",
        goalId: "goal-dev",
        status: "planned",
        order: 0,
      } as never);

      vi.mocked(prisma.milestone.findUnique).mockResolvedValue({
        id: "ms-devfest-123",
        title: "Host DevFest Fuoye",
        goal: { workspaceId },
      } as never);

      vi.mocked(prisma.boardItem.create).mockResolvedValue({ id: "bi-1" } as never);
      vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.task.create).mockResolvedValue({
        id: "task-venue",
        title: "Book Auditorium Hall",
        milestoneId: "ms-devfest-123",
        workspaceId,
        priority: "high",
        order: 0,
        status: "todo",
      } as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          action: "create_milestone",
          title: "Host DevFest Fuoye",
          goalTitle: "Developer Ecosystem",
        },
        {
          action: "create_task",
          title: "Book Auditorium Hall",
          milestoneTitle: "Host DevFest Fuoye",
          priority: "high",
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].action).toBe("create_milestone");
      expect(results[0].entityId).toBe("ms-devfest-123");

      expect(results[1].success).toBe(true);
      expect(results[1].action).toBe("create_task");
      expect(results[1].details?.milestoneId).toBe("ms-devfest-123");
      expect(results[1].message).toContain('Created task "Book Auditorium Hall" under milestone "Host DevFest Fuoye"');
    });

    it("creates milestone and subsequent tasks referencing it via placeholder 'new'", async () => {
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({
        id: "goal-dev",
        title: "Developer Ecosystem",
        workspaceId,
        status: "active",
      } as never);

      vi.mocked(prisma.milestone.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.milestone.create).mockResolvedValue({
        id: "ms-devfest-456",
        title: "Host DevFest Fuoye",
        goalId: "goal-dev",
        status: "planned",
        order: 0,
      } as never);

      vi.mocked(prisma.milestone.findUnique).mockResolvedValue({
        id: "ms-devfest-456",
        title: "Host DevFest Fuoye",
        goal: { workspaceId },
      } as never);

      vi.mocked(prisma.boardItem.create).mockResolvedValue({ id: "bi-2" } as never);
      vi.mocked(prisma.task.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.task.create).mockResolvedValue({
        id: "task-catering",
        title: "Order catering",
        milestoneId: "ms-devfest-456",
        workspaceId,
        priority: "medium",
        order: 0,
        status: "todo",
      } as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          action: "create_milestone",
          title: "Host DevFest Fuoye",
        },
        {
          action: "create_task",
          title: "Order catering",
          milestoneId: "new",
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].action).toBe("create_milestone");

      expect(results[1].success).toBe(true);
      expect(results[1].action).toBe("create_task");
      expect(results[1].details?.milestoneId).toBe("ms-devfest-456");
    });

    it("creates milestone with nested tasks array directly", async () => {
      vi.mocked(prisma.goal.findFirst).mockResolvedValue({
        id: "goal-dev",
        title: "Developer Ecosystem",
        workspaceId,
        status: "active",
      } as never);

      vi.mocked(prisma.milestone.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.milestone.create).mockResolvedValue({
        id: "ms-devfest-789",
        title: "Host DevFest Fuoye",
        goalId: "goal-dev",
        status: "planned",
        order: 0,
      } as never);

      vi.mocked(prisma.boardItem.create).mockResolvedValue({ id: "bi-3" } as never);
      vi.mocked(prisma.task.create)
        .mockResolvedValueOnce({
          id: "task-1",
          title: "Design Swag",
          milestoneId: "ms-devfest-789",
          workspaceId,
          priority: "high",
          order: 0,
          status: "todo",
        } as never)
        .mockResolvedValueOnce({
          id: "task-2",
          title: "Setup Registration Site",
          milestoneId: "ms-devfest-789",
          workspaceId,
          priority: "urgent",
          order: 1,
          status: "todo",
        } as never);

      const results = await executeBoardActions(workspaceId, userId, [
        {
          action: "create_milestone",
          title: "Host DevFest Fuoye",
          tasks: [
            { title: "Design Swag", priority: "high" },
            { title: "Setup Registration Site", priority: "urgent" },
          ],
        },
      ]);

      expect(results).toHaveLength(3);
      const createdMilestoneRes = results.find((r) => r.action === "create_milestone");
      const createdTaskResults = results.filter((r) => r.action === "create_task");

      expect(createdMilestoneRes?.success).toBe(true);
      expect(createdMilestoneRes?.entityId).toBe("ms-devfest-789");

      expect(createdTaskResults).toHaveLength(2);
      expect(createdTaskResults[0].entityTitle).toBe("Design Swag");
      expect(createdTaskResults[0].details?.milestoneId).toBe("ms-devfest-789");
      expect(createdTaskResults[1].entityTitle).toBe("Setup Registration Site");
      expect(createdTaskResults[1].details?.milestoneId).toBe("ms-devfest-789");
    });
  });

  describe("undoBoardAction", () => {
    it("reverts task assignment back to previous assignees", async () => {
      vi.mocked(prisma.task.findUnique).mockResolvedValue({
        id: "task-skill-1",
        title: "Skill Development",
        milestone: { goal: { workspaceId } },
      } as never);

      const undoResult = await undoBoardAction(workspaceId, userId, {
        id: "act-1",
        action: "assign_task",
        entityType: "task",
        entityId: "task-skill-1",
        entityTitle: "Skill Development",
        success: true,
        message: "Assigned Grace to Skill Development",
        canUndo: true,
        appliedAt: new Date().toISOString(),
        undoData: {
          taskId: "task-skill-1",
          prevAssignees: [{ userId: "usr-previous", role: "owner" }],
        },
      });

      expect(undoResult.success).toBe(true);
      expect(undoResult.message).toContain("Reverted assignment");
      expect(prisma.taskAssignment.createMany).toHaveBeenCalledWith({
        data: [{ taskId: "task-skill-1", userId: "usr-previous", role: "owner" }],
        skipDuplicates: true,
      });
    });

    it("restores deleted milestone and its tasks", async () => {
      vi.mocked(prisma.goal.findUnique).mockResolvedValue({
        id: "goal-1",
        workspaceId,
      } as never);

      vi.mocked(prisma.milestone.create).mockResolvedValue({
        id: "ms-1",
        title: "Community Setup & Planning",
      } as never);

      vi.mocked(prisma.task.create).mockResolvedValue({ id: "task-1" } as never);
      vi.mocked(prisma.boardItem.create).mockResolvedValue({ id: "bi-1" } as never);

      const undoResult = await undoBoardAction(workspaceId, userId, {
        id: "act-2",
        action: "delete_milestone",
        entityType: "milestone",
        entityId: "ms-1",
        entityTitle: "Community Setup & Planning",
        success: true,
        message: "Deleted milestone",
        canUndo: true,
        appliedAt: new Date().toISOString(),
        undoData: {
          milestone: {
            id: "ms-1",
            goalId: "goal-1",
            title: "Community Setup & Planning",
            description: null,
            status: "planned",
            targetDate: null,
            startDate: null,
            dependsOn: [],
            order: 0,
          },
          tasks: [
            {
              id: "task-1",
              title: "Setup forum",
              description: null,
              assignees: [],
              status: "todo",
              priority: "medium",
              storyPoints: 1,
              dueDate: null,
              order: 0,
              workspaceId,
            },
          ],
        },
      });

      expect(undoResult.success).toBe(true);
      expect(undoResult.message).toContain("Restored milestone");
      expect(prisma.milestone.create).toHaveBeenCalled();
      expect(prisma.task.create).toHaveBeenCalled();
      expect(prisma.boardItem.create).toHaveBeenCalled();
    });
  });
});
