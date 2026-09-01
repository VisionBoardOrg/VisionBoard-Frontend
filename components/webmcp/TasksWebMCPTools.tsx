"use client";

/**
 * TasksWebMCPTools — registers task-specific MCP tools.
 * Mount inside the TasksFilteredList component (tasks page only).
 *
 * Tools registered here:
 *   - create_task  create a new task inside a milestone
 */

import { useEffect } from "react";

interface Props {
  workspaceId: string;
}

type ModelContext = {
  registerTool: (tool: unknown, opts?: unknown) => Promise<void>;
};

async function waitForModelContext(): Promise<ModelContext | undefined> {
  for (let i = 0; i < 20; i++) {
    const mc = (document as unknown as { modelContext?: ModelContext })
      .modelContext;
    if (mc) return mc;
    await new Promise((r) => setTimeout(r, 100));
  }
  return (document as unknown as { modelContext?: ModelContext }).modelContext;
}

export function TasksWebMCPTools({ workspaceId }: Props) {
  useEffect(() => {
    let cancelled = false;

    async function register() {
      const mc = await waitForModelContext();
      if (!mc || cancelled) return;

      const controllers: AbortController[] = [];

      // ── create_task ───────────────────────────────────────────────────────
      const createCtrl = new AbortController();
      controllers.push(createCtrl);
      await mc.registerTool(
        {
          name: "create_task",
          description:
            "Create a new task inside a milestone. You need a milestoneId — use list_goals to find goals and their milestones first.",
          inputSchema: {
            type: "object",
            properties: {
              milestoneId: {
                type: "string",
                description: "ID of the milestone to add the task to",
              },
              title: {
                type: "string",
                description: "Task title (max 255 characters)",
              },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "urgent"],
                description: "Task priority level (default: medium)",
              },
              dueDate: {
                type: "string",
                description:
                  "ISO 8601 due date string (e.g. 2026-10-15)",
              },
            },
            required: ["milestoneId", "title"],
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute({
            milestoneId,
            title,
            priority,
            dueDate,
          }: {
            milestoneId: string;
            title: string;
            priority?: string;
            dueDate?: string;
          }) {
            const res = await fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId,
                milestoneId,
                title,
                priority: priority ?? "medium",
                dueDate: dueDate ?? null,
              }),
            });
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              return {
                content: [{ type: "text" as const, text: `Failed to create task: ${err.error ?? res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              task: { id: string; title: string };
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✓ Task created: "${data.task?.title ?? title}" (ID: ${
                    data.task?.id ?? "unknown"
                  }). Refresh to see it.`,
                },
              ],
            };
          },
        },
        { signal: createCtrl.signal }
      );

      return () => controllers.forEach((c) => c.abort());
    }

    let cleanup: (() => void) | undefined;
    register().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [workspaceId]);

  return null;
}
