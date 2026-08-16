import { prisma } from "@/lib/prisma";
import { TEMPLATES, TemplateName } from "@/lib/templates";
import { MemberRole } from "@prisma/client";

interface SeedWorkspaceOptions {
  userId: string;
  workspaceName: string;
  role?: MemberRole;
  template: TemplateName;
}

export async function seedWorkspace({
  userId,
  workspaceName,
  template,
}: SeedWorkspaceOptions) {
  const templateData = TEMPLATES[template];
  const slug = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") +
    "-" +
    Math.random().toString(36).slice(2, 6);

  // Create workspace + member in a transaction
  const workspace = await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: workspaceName,
        slug,
        ownerId: userId,
      },
    });

    // The workspace creator is always an admin so they can manage members,
    // regardless of which role they selected during onboarding.
    await tx.workspaceMember.create({
      data: {
        workspaceId: ws.id,
        userId,
        role: "admin",
      },
    });

    // Seed sprints
    const sprintMap: Record<string, string> = {};
    for (const sprintDef of templateData.data.sprints) {
      const sprint = await tx.sprint.create({
        data: {
          workspaceId: ws.id,
          name: sprintDef.name,
          startDate: sprintDef.startDate,
          endDate: sprintDef.endDate,
          velocity: sprintDef.velocity,
          status: "active",
        },
      });
      sprintMap[sprintDef.name] = sprint.id;
    }

    // Seed goals → milestones → tasks
    let boardX = 60;
    let boardY = 60;

    for (const goalDef of templateData.data.goals) {
      const goal = await tx.goal.create({
        data: {
          workspaceId: ws.id,
          title: goalDef.title,
          objective: goalDef.objective,
          keyResults: goalDef.keyResults as never,
          status: goalDef.status,
          targetDate: goalDef.targetDate,
          ownerId: userId,
        },
      });

      // Goal board item
      await tx.boardItem.create({
        data: {
          workspaceId: ws.id,
          x: boardX,
          y: boardY,
          width: 240,
          height: 80,
          entityType: "goal",
          linkedGoalId: goal.id,
        },
      });

      boardX += 280;

      for (const msDef of goalDef.milestones) {
        const milestone = await tx.milestone.create({
          data: {
            goalId: goal.id,
            title: msDef.title,
            description: msDef.description,
            status: msDef.status,
            targetDate: msDef.targetDate,
            order: msDef.order,
          },
        });

        // Milestone board item
        await tx.boardItem.create({
          data: {
            workspaceId: ws.id,
            x: boardX,
            y: boardY + 120,
            width: 220,
            height: 100,
            entityType: "milestone",
            linkedMilestoneId: milestone.id,
          },
        });

        boardX += 260;

        // Find first available sprint for in-progress tasks
        const sprintIds = Object.values(sprintMap);
        const firstSprintId = sprintIds[0] ?? null;

        for (const taskDef of msDef.tasks) {
          await tx.task.create({
            data: {
              milestoneId: milestone.id,
              title: taskDef.title,
              status: taskDef.status,
              priority: taskDef.priority,
              storyPoints: taskDef.storyPoints,
              order: taskDef.order,
              dueDate: msDef.targetDate ?? new Date(),
              sprintId: taskDef.status === "in_progress" || taskDef.status === "todo" ? firstSprintId : null,
              assigneeId: userId,
            },
          });
        }
      }

      boardY += 320;
      boardX = 60;
    }

    return ws;
  }, { maxWait: 10000, timeout: 30000 });

  return workspace;
}
