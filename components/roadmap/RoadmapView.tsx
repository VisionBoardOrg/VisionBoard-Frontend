"use client";

import { useState } from "react";
import { Zap, Lock, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

interface MilestoneSimple {
  id: string;
  title: string;
  description: string | null;
  status: string;
  targetDate: Date | null;
  startDate: Date | null;
  order: number;
}

interface GoalWithMilestones {
  id: string;
  title: string;
  objective: string;
  status: string;
  targetDate: Date | null;
  milestones: MilestoneSimple[];
}

interface RoadmapViewProps {
  workspaceId: string;
  goals: GoalWithMilestones[];
  isGated: boolean;
  upgradePrompt: string | undefined;
  userRole: string | null;
}

const MONTH_WIDTH = 160; // px per month on the Gantt
const ROW_H = 48;

function getMonthsBetween(start: Date, end: Date) {
  const months: Date[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function getLeft(date: Date, timelineStart: Date) {
  const daysDiff = (date.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, (daysDiff / 30) * MONTH_WIDTH);
}

export function RoadmapView({ workspaceId, goals, isGated, upgradePrompt, userRole }: RoadmapViewProps) {
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ milestones: { title: string; description: string; targetDate: string }[]; generationId: string } | null>(null);
  const [aiError, setAiError] = useState("");

  // Build timeline bounds
  const today = new Date();
  const allDates = goals.flatMap((g) => [
    g.targetDate,
    g.milestones.map((m) => m.targetDate),
  ]).flat().filter(Boolean) as Date[];

  const timelineStart = allDates.length > 0
    ? new Date(Math.min(...allDates.map((d) => d.getTime())) - 30 * 24 * 60 * 60 * 1000)
    : new Date(today.getFullYear(), today.getMonth() - 1, 1);

  const timelineEnd = allDates.length > 0
    ? new Date(Math.max(...allDates.map((d) => d.getTime())) + 60 * 24 * 60 * 60 * 1000)
    : new Date(today.getFullYear(), today.getMonth() + 6, 1);

  const months = getMonthsBetween(timelineStart, timelineEnd);
  const totalWidth = months.length * MONTH_WIDTH;
  const todayLeft = getLeft(today, timelineStart);

  async function generateRoadmap() {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiResult(null);

    const res = await fetch("/api/ai/roadmap-generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, text: aiInput }),
    });
    const data = await res.json();
    if (!res.ok) { setAiError(data.error || "AI generation failed."); }
    else setAiResult(data);
    setAiLoading(false);
  }

  const STATUS_COLORS: Record<string, string> = {
    completed: "bg-success", in_progress: "bg-blue", planned: "bg-border", delayed: "bg-danger",
    draft: "bg-muted", active: "bg-blue",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Roadmap</h1>
          <p className="text-slate text-sm mt-1">Timeline view of goals and milestones</p>
        </div>
        {isGated && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <Lock size={14} className="text-amber-500" />
            <span className="text-xs text-amber-700">{upgradePrompt ?? "Upgrade to view Gantt timeline"}</span>
          </div>
        )}
      </div>

      {/* AI Roadmap Generator */}
      <div className="bg-white rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-blue" />
          <h2 className="font-semibold text-ink">AI Roadmap Generator</h2>
        </div>
        <p className="text-sm text-slate mb-4">Describe your project goals in plain text — Claude will generate structured milestones for your review.</p>

        <textarea
          value={aiInput}
          onChange={(e) => setAiInput(e.target.value)}
          placeholder="e.g. We need to launch a B2B SaaS product by Q4. Key priorities are user auth, core dashboard, billing integration, and a public API..."
          rows={3}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
        />

        {aiError && <p className="text-sm text-danger mt-2">{aiError}</p>}

        <button
          onClick={generateRoadmap}
          disabled={!aiInput.trim() || aiLoading}
          className="mt-3 flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors disabled:opacity-50"
        >
          <Zap size={14} />
          {aiLoading ? "Generating…" : "Generate roadmap"}
        </button>

        {/* AI output — review before commit */}
        {aiResult && (
          <div className="mt-5 p-4 bg-blue-faint border border-blue-light rounded-xl">
            <h3 className="text-sm font-semibold text-blue mb-3">Generated milestones — review before applying</h3>
            <div className="space-y-2">
              {aiResult.milestones.map((m, i) => (
                <div key={i} className="bg-white rounded-lg border border-border p-3">
                  <div className="font-medium text-ink text-sm">{m.title}</div>
                  <div className="text-xs text-slate mt-0.5">{m.description}</div>
                  <div className="text-xs text-muted mt-1">Target Date: {new Date(m.targetDate).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  // Select which goal to commit to (simplified — take first active goal)
                  const targetGoal = goals.find(g => g.status === "active") ?? goals[0];
                  if (!targetGoal) { alert("Create a goal first to commit milestones to."); return; }
                  fetch("/api/ai/roadmap-generator/commit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ generationId: aiResult.generationId, goalId: targetGoal.id, milestones: aiResult.milestones }),
                  }).then(() => { setAiResult(null); window.location.reload(); });
                }}
                className="flex-1 bg-blue text-white text-sm font-semibold py-2 rounded-lg hover:bg-blue-mid transition-colors"
              >
                Apply to roadmap
              </button>
              <button
                onClick={() => setAiResult(null)}
                className="px-4 border border-border text-sm text-slate rounded-lg hover:bg-offwhite transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Gantt timeline (gated on startup+ plan) */}
      {isGated ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center">
          <Lock size={32} className="text-muted mx-auto mb-3" />
          <h3 className="font-semibold text-ink">Timeline view requires Startup plan or higher</h3>
          <p className="text-sm text-slate mt-1 mb-4">{upgradePrompt}</p>
          <Link href={`/workspace/${workspaceId}/settings`} className="inline-flex items-center gap-1 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors">
            Upgrade plan <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: totalWidth + 220 }}>
              {/* Header */}
              <div className="flex border-b border-border">
                <div className="w-52 shrink-0 p-3 text-xs font-semibold text-muted border-r border-border">Goal / Milestone</div>
                <div className="flex">
                  {months.map((m) => (
                    <div key={m.toISOString()} style={{ width: MONTH_WIDTH }} className="p-2 text-xs text-muted border-r border-border last:border-r-0">
                      {m.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rows */}
              {goals.map((goal) => (
                <div key={goal.id}>
                  {/* Goal row */}
                  <div className="flex border-b border-border" style={{ height: ROW_H }}>
                    <div className="w-52 shrink-0 flex items-center gap-2 px-3 border-r border-border">
                      <div className="w-2 h-2 rounded-full bg-blue shrink-0" />
                      <span className="text-xs font-semibold text-ink truncate">{goal.title}</span>
                    </div>
                    <div className="relative flex-1" style={{ minWidth: totalWidth }}>
                      {goal.targetDate && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-5 rounded-full bg-blue/20 border border-blue/40 flex items-center px-2"
                          style={{ left: getLeft(new Date(goal.targetDate), timelineStart) - 40, width: 80 }}
                        >
                          <span className="text-[9px] text-blue font-semibold truncate">{goal.title.slice(0, 10)}</span>
                        </div>
                      )}
                      {/* Today line */}
                      <div className="absolute top-0 bottom-0 w-px bg-blue/40" style={{ left: todayLeft }} />
                    </div>
                  </div>

                  {/* Milestone rows */}
                  {goal.milestones.map((ms) => (
                    <div key={ms.id} className="flex border-b border-border/50" style={{ height: ROW_H }}>
                      <div className="w-52 shrink-0 flex items-center gap-2 pl-7 pr-3 border-r border-border">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[ms.status] ?? "bg-muted"}`} />
                        <span className="text-xs text-slate truncate">{ms.title}</span>
                      </div>
                      <div className="relative flex-1" style={{ minWidth: totalWidth }}>
                        {ms.startDate && ms.targetDate && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-full opacity-80 ${STATUS_COLORS[ms.status] ?? "bg-muted"}`}
                            style={{
                              left: getLeft(new Date(ms.startDate), timelineStart),
                              width: Math.max(20, getLeft(new Date(ms.targetDate), timelineStart) - getLeft(new Date(ms.startDate), timelineStart)),
                            }}
                          />
                        )}
                        {!ms.startDate && ms.targetDate && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2"
                            style={{ left: getLeft(new Date(ms.targetDate), timelineStart) - 6 }}
                          >
                            <div className="w-3 h-3 rotate-45 border-2 border-blue bg-white" />
                          </div>
                        )}
                        <div className="absolute top-0 bottom-0 w-px bg-blue/20" style={{ left: todayLeft }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
