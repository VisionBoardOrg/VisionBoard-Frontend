"use client";

/**
 * GoalsWebMCPTools — registers goal-specific MCP tools.
 * Mount inside the GoalsList component (goals page only).
 *
 * Tools registered here:
 *   - list_goals   list all goals in this workspace
 *   - create_goal  create a new goal
 */

import { useEffect } from "react";

interface Props {
  workspaceId: string;
  canCreate: boolean;
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

export function GoalsWebMCPTools({ workspaceId, canCreate }: Props) {
  useEffect(() => {
    let cancelled = false;

    async function register() {
      const mc = await waitForModelContext();
      if (!mc || cancelled) return;

      const controllers: AbortController[] = [];

      // ── list_goals ────────────────────────────────────────────────────────
      const listCtrl = new AbortController();
      controllers.push(listCtrl);
      await mc.registerTool(
        {
          name: "list_goals",
          description:
            "List all goals in this workspace with their status, health score, milestone count, and progress.",
          inputSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["draft", "active", "completed", "cancelled"],
                description: "Optional filter by goal status",
              },
            },
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          async execute({ status }: { status?: string }) {
            const url = new URL("/api/goals", window.location.origin);
            url.searchParams.set("workspaceId", workspaceId);
            const res = await fetch(url.toString());
            if (!res.ok) {
              return {
                content: [{ type: "text" as const, text: `Failed to fetch goals: ${res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              goals: {
                id: string;
                title: string;
                objective: string;
                status: string;
                healthScore: number;
                targetDate?: string;
              }[];
            };
            let goals = data.goals ?? [];
            if (status) goals = goals.filter((g) => g.status === status);
            if (!goals.length) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: status ? `No ${status} goals found.` : "No goals yet.",
                  },
                ],
              };
            }
            const text = goals
              .map(
                (g) =>
                  `• [${g.status.toUpperCase()}] ${g.title} (health: ${g.healthScore}%)${
                    g.targetDate
                      ? ` — target ${new Date(g.targetDate).toLocaleDateString()}`
                      : ""
                  }\n  ${g.objective}`
              )
              .join("\n\n");
            return {
              content: [{ type: "text" as const, text }],
            };
          },
        },
        { signal: listCtrl.signal }
      );

      // ── create_goal ───────────────────────────────────────────────────────
      if (canCreate) {
        const createCtrl = new AbortController();
        controllers.push(createCtrl);
        await mc.registerTool(
          {
            name: "create_goal",
            description:
              "Create a new goal in this workspace with a title and objective. Optionally provide a target date.",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Short goal title (max 255 characters)",
                },
                objective: {
                  type: "string",
                  description: "Clear description of what success looks like",
                },
                targetDate: {
                  type: "string",
                  description:
                    "ISO 8601 date string for the goal deadline (e.g. 2026-12-31)",
                },
              },
              required: ["title", "objective"],
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute({
              title,
              objective,
              targetDate,
            }: {
              title: string;
              objective: string;
              targetDate?: string;
            }) {
              const res = await fetch("/api/goals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  workspaceId,
                  title,
                  objective,
                  targetDate: targetDate ?? null,
                  status: "draft",
                }),
              });
              if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as {
                  error?: string;
                };
                return {
                  content: [{ type: "text" as const, text: `Failed to create goal: ${err.error ?? res.statusText}` }],
                  isError: true,
                };
              }
              const data = (await res.json()) as {
                goal: { id: string; title: string };
              };
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `✓ Goal created: "${data.goal?.title ?? title}" (ID: ${
                      data.goal?.id ?? "unknown"
                    }). Refresh the page to see it.`,
                  },
                ],
              };
            },
          },
          { signal: createCtrl.signal }
        );
      }

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
  }, [workspaceId, canCreate]);

  return null;
}
