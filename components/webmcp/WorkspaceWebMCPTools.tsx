"use client";

/**
 * WorkspaceWebMCPTools — registers shared MCP tools on every workspace page.
 *
 * These tools are always available to a browser AI agent when the user has
 * any workspace page open. They use the user's existing browser session —
 * no separate API key is needed.
 *
 * Tools registered here:
 *   - search_workspace      semantic search across all workspace content
 *   - get_standup_digest    generate a daily standup for this workspace
 *   - get_executive_summary generate an executive briefing
 *   - list_my_tasks         list tasks assigned to the current user
 *   - update_task_status    change the status of a task
 */

import { useEffect } from "react";
import { initializeWebMCP } from "@/lib/webmcp/init";

interface Props {
  workspaceId: string;
}

type ModelContext = {
  registerTool: (tool: unknown, opts?: unknown) => Promise<void>;
};

function getModelContext(): ModelContext | undefined {
  return (document as unknown as { modelContext?: ModelContext }).modelContext;
}

/** Waits up to 2 s for document.modelContext to be populated by the polyfill. */
async function waitForModelContext(): Promise<ModelContext | undefined> {
  for (let i = 0; i < 20; i++) {
    const mc = getModelContext();
    if (mc) return mc;
    await new Promise((r) => setTimeout(r, 100));
  }
  return getModelContext();
}

export function WorkspaceWebMCPTools({ workspaceId }: Props) {
  useEffect(() => {
    initializeWebMCP();

    let cancelled = false;

    async function register() {
      const mc = await waitForModelContext();
      if (!mc || cancelled) return;

      const controllers: AbortController[] = [];

      // ── search_workspace ──────────────────────────────────────────────────
      const searchCtrl = new AbortController();
      controllers.push(searchCtrl);
      await mc.registerTool(
        {
          name: "search_workspace",
          description:
            "Semantically search goals, tasks, documents, and comments in this workspace. Returns the most relevant matches with links.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Natural language search query (minimum 2 characters, max 500)",
              },
            },
            required: ["query"],
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          async execute({ query }: { query: string }) {
            const res = await fetch("/api/ai/copilot/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, query }),
            });
            if (!res.ok) {
              return {
                content: [{ type: "text" as const, text: `Search failed: ${res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              results: {
                title: string;
                snippet: string;
                entityType: string;
                url: string;
              }[];
            };
            if (!data.results?.length) {
              return {
                content: [{ type: "text" as const, text: "No results found." }],
              };
            }
            const text = data.results
              .map(
                (r) =>
                  `[${r.entityType.toUpperCase()}] ${r.title}\n${r.snippet}\n→ ${r.url}`
              )
              .join("\n\n");
            return {
              content: [{ type: "text" as const, text }],
            };
          },
        },
        { signal: searchCtrl.signal }
      );

      // ── get_standup_digest ────────────────────────────────────────────────
      const standupCtrl = new AbortController();
      controllers.push(standupCtrl);
      await mc.registerTool(
        {
          name: "get_standup_digest",
          description:
            "Generate a daily standup digest for this workspace showing completed tasks, in-progress work, and blockers.",
          inputSchema: { type: "object", properties: {} },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          async execute() {
            const res = await fetch("/api/ai/copilot/standup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId }),
            });
            if (!res.ok) {
              return {
                content: [{ type: "text" as const, text: `Failed to generate standup: ${res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as { standup: string };
            return {
              content: [{ type: "text" as const, text: data.standup ?? "No standup data available." }],
            };
          },
        },
        { signal: standupCtrl.signal }
      );

      // ── get_executive_summary ─────────────────────────────────────────────
      const execCtrl = new AbortController();
      controllers.push(execCtrl);
      await mc.registerTool(
        {
          name: "get_executive_summary",
          description:
            "Generate an executive status briefing for this workspace covering goal health, achievements, risks, and recommendations.",
          inputSchema: { type: "object", properties: {} },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          async execute() {
            const res = await fetch("/api/ai/copilot/executive-summary", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId }),
            });
            if (!res.ok) {
              return {
                content: [{ type: "text" as const, text: `Failed to generate summary: ${res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              summary?: string;
              executiveSummary?: string;
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: data.summary ?? data.executiveSummary ?? "No summary available.",
                },
              ],
            };
          },
        },
        { signal: execCtrl.signal }
      );

      // ── list_my_tasks ─────────────────────────────────────────────────────
      const tasksCtrl = new AbortController();
      controllers.push(tasksCtrl);
      await mc.registerTool(
        {
          name: "list_my_tasks",
          description:
            "List tasks assigned to the current user in this workspace, optionally filtered by status.",
          inputSchema: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["todo", "in_progress", "in_review", "blocked", "done"],
                description: "Optional filter by task status",
              },
            },
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          async execute({ status }: { status?: string }) {
            const url = new URL("/api/tasks", window.location.origin);
            url.searchParams.set("workspaceId", workspaceId);
            const res = await fetch(url.toString());
            if (!res.ok) {
              return {
                content: [{ type: "text" as const, text: `Failed to fetch tasks: ${res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              tasks: {
                id: string;
                title: string;
                status: string;
                priority: string;
                dueDate?: string;
                blockedReason?: string;
              }[];
            };
            let tasks = data.tasks ?? [];
            if (status) tasks = tasks.filter((t) => t.status === status);
            if (!tasks.length) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: status
                      ? `No tasks with status "${status}".`
                      : "No tasks assigned to you.",
                  },
                ],
              };
            }
            const text = tasks
              .map(
                (t) =>
                  `• [${t.status.toUpperCase()}] ${t.title} (${t.priority} priority)${
                    t.dueDate
                      ? ` — due ${new Date(t.dueDate).toLocaleDateString()}`
                      : ""
                  }${t.blockedReason ? `\n  ⛔ Blocked: ${t.blockedReason}` : ""}`
              )
              .join("\n");
            return {
              content: [{ type: "text" as const, text }],
            };
          },
        },
        { signal: tasksCtrl.signal }
      );

      // ── update_task_status ────────────────────────────────────────────────
      const updateCtrl = new AbortController();
      controllers.push(updateCtrl);
      await mc.registerTool(
        {
          name: "update_task_status",
          description:
            "Update the status of a task by its ID. Use list_my_tasks to find task IDs first.",
          inputSchema: {
            type: "object",
            properties: {
              taskId: {
                type: "string",
                description: "The ID of the task to update",
              },
              status: {
                type: "string",
                enum: ["todo", "in_progress", "in_review", "blocked", "done"],
                description: "The new status for the task",
              },
              blockedReason: {
                type: "string",
                description:
                  "Required when setting status to 'blocked'. Describe why the task is blocked.",
              },
            },
            required: ["taskId", "status"],
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute({
            taskId,
            status,
            blockedReason,
          }: {
            taskId: string;
            status: string;
            blockedReason?: string;
          }) {
            const body: Record<string, unknown> = { status };
            if (status === "blocked" && blockedReason)
              body.blockedReason = blockedReason;
            const res = await fetch(`/api/tasks/${taskId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!res.ok) {
              return {
                content: [{ type: "text" as const, text: `Failed to update task: ${res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              task: { title: string; status: string };
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: `✓ Task "${data.task?.title ?? taskId}" updated to ${status}.`,
                },
              ],
            };
          },
        },
        { signal: updateCtrl.signal }
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

  // Renders nothing — pure side-effect component
  return null;
}
