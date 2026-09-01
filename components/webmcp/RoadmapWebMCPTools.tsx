"use client";

/**
 * RoadmapWebMCPTools — registers roadmap-specific MCP tools.
 * Mount inside the RoadmapView component (roadmap page only).
 *
 * Tools registered here:
 *   - generate_roadmap  AI-powered roadmap generation from a description
 *
 * Note: the /api/ai/roadmap-generator endpoint accepts a "text" field
 * (not "description") — this component maps the tool's "description"
 * input to that field name.
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

export function RoadmapWebMCPTools({ workspaceId }: Props) {
  useEffect(() => {
    let cancelled = false;

    async function register() {
      const mc = await waitForModelContext();
      if (!mc || cancelled) return;

      const controllers: AbortController[] = [];

      // ── generate_roadmap ──────────────────────────────────────────────────
      const roadmapCtrl = new AbortController();
      controllers.push(roadmapCtrl);
      await mc.registerTool(
        {
          name: "generate_roadmap",
          description:
            "Generate a structured product roadmap from a plain-text project description. Returns a goal title, objective, and a list of milestones with suggested tasks. Consumes one AI credit.",
          inputSchema: {
            type: "object",
            properties: {
              description: {
                type: "string",
                description:
                  "Plain-text description of the project or feature to plan (max 2000 characters)",
              },
            },
            required: ["description"],
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          async execute({ description }: { description: string }) {
            // The roadmap generator API uses "text" as its input field name
            const res = await fetch("/api/ai/roadmap-generator", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, text: description }),
            });
            if (!res.ok) {
              const err = (await res.json().catch(() => ({}))) as {
                error?: string;
              };
              return {
                content: [{ type: "text" as const, text: `Failed to generate roadmap: ${err.error ?? res.statusText}` }],
                isError: true,
              };
            }
            const data = (await res.json()) as {
              goalTitle?: string;
              goalObjective?: string;
              milestones: {
                title: string;
                targetDate: string;
                suggestedTasks?: string[];
                description?: string;
              }[];
            };
            const lines = [
              `🎯 Goal: ${data.goalTitle ?? "(no title)"}`,
              `📋 Objective: ${data.goalObjective ?? "(no objective)"}`,
              "",
              "🗺️ Milestones:",
              ...data.milestones.map((m, i) => {
                const tasks = m.suggestedTasks ?? [];
                return `  ${i + 1}. ${m.title} (target: ${m.targetDate})${
                  tasks.length
                    ? `\n     Tasks: ${tasks.slice(0, 3).join(", ")}${tasks.length > 3 ? "…" : ""}`
                    : ""
                }`;
              }),
            ];
            return {
              content: [{ type: "text" as const, text: lines.join("\n") }],
            };
          },
        },
        { signal: roadmapCtrl.signal }
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
