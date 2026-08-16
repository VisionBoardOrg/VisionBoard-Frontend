"use client";

import React, { useState } from "react";
import {
  Zap,
  Lock,
  ChevronRight,
  Plus,
  Flame,
  GitCommit,
  Search,
  Filter,
  Sparkles,
  Camera,
  Target,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TimeScale } from "@/lib/gantt-engine";
import { InteractiveGantt, GoalGroup } from "./InteractiveGantt";
import { NewMilestoneModal } from "./NewMilestoneModal";
import { NewGoalModal } from "@/components/goals/NewGoalModal";

interface RoadmapViewProps {
  workspaceId: string;
  goals: GoalGroup[];
  isGated: boolean;
  upgradePrompt: string | undefined;
  userRole: string | null;
}

export function RoadmapView({
  workspaceId,
  goals: initialGoals,
  isGated,
  upgradePrompt,
}: RoadmapViewProps) {
  const router = useRouter();
  const [goals, setGoals] = useState<GoalGroup[]>(initialGoals);
  const [timeScale, setTimeScale] = useState<TimeScale>("month");
  const [highlightCriticalPath, setHighlightCriticalPath] = useState(false);
  const [showBaseline, setShowBaseline] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // Modals
  const [isNewMilestoneOpen, setIsNewMilestoneOpen] = useState(false);
  const [selectedGoalForMilestone, setSelectedGoalForMilestone] = useState<string | undefined>();
  const [isNewGoalOpen, setIsNewGoalOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [baselineLoading, setBaselineLoading] = useState(false);
  const [baselineSuccess, setBaselineSuccess] = useState(false);

  // AI Generator state
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    goalTitle?: string;
    goalObjective?: string;
    milestones: { title: string; description: string; targetDate: string; suggestedTasks?: string[] }[];
    generationId: string;
  } | null>(null);
  const [aiError, setAiError] = useState("");
  const [commitGoalId, setCommitGoalId] = useState<string | null>(null);
  const [commitLoading, setCommitLoading] = useState(false);

  // Flatten milestones for child components
  const allMilestones = goals.flatMap((g) =>
    g.milestones.map((m) => ({ ...m, goalId: g.id, goalTitle: g.title }))
  );

  const totalMilestones = allMilestones.length;
  const completedMilestones = allMilestones.filter((m) => m.status === "completed").length;
  const progressPercent =
    totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  async function handleRefresh() {
    router.refresh();
  }

  // Snapshot Baseline across all workspace goals
  async function handleSnapshotBaseline() {
    if (goals.length === 0) return;
    setBaselineLoading(true);
    try {
      // Snapshot baseline for each goal in workspace
      await Promise.all(
        goals.map((g) =>
          fetch(`/api/goals/${g.id}/baseline`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "snapshot" }),
          })
        )
      );
      setBaselineSuccess(true);
      setShowBaseline(true);
      setTimeout(() => setBaselineSuccess(false), 3000);
      router.refresh();
    } catch (err) {
      console.error("Failed to snapshot baseline:", err);
    } finally {
      setBaselineLoading(false);
    }
  }

  // AI Roadmap Generation
  async function generateRoadmap() {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiResult(null);

    try {
      const res = await fetch("/api/ai/roadmap-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, text: aiInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "AI generation failed.");
      } else {
        setAiResult(data);
        if (data.goalTitle) {
          setCommitGoalId("__NEW_AI_GOAL__");
        } else if (goals.length > 0) {
          setCommitGoalId(goals[0]?.id || null);
        } else {
          setCommitGoalId(null);
        }
      }
    } catch {
      setAiError("Network error while generating roadmap.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-full">
      {/* ── 1. Page Header & Primary Actions ─────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-ink">Interactive Roadmap</h1>
            <span className="text-xs font-semibold bg-blue-faint text-blue border border-blue-light px-2.5 py-0.5 rounded-full">
              {goals.length} Goal{goals.length !== 1 ? "s" : ""} • {totalMilestones} Milestones ({progressPercent}% Complete)
            </span>
          </div>
          <p className="text-slate text-sm mt-1">
            Gantt scheduling canvas with dependency tracking, critical path, and cascade automation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* AI Generator Button */}
          <button
            onClick={() => setIsAiOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isAiOpen
                ? "bg-blue text-white border-blue shadow-xs"
                : "bg-white text-ink border-border hover:bg-slate-50"
            }`}
          >
            <Zap size={14} className={isAiOpen ? "text-white" : "text-blue"} />
            <span>AI Roadmap Gen</span>
          </button>

          {/* New Milestone Button */}
          <button
            onClick={() => {
              setSelectedGoalForMilestone(undefined);
              setIsNewMilestoneOpen(true);
            }}
            className="flex items-center gap-1.5 bg-blue text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-blue-mid transition-all shadow-xs"
          >
            <Plus size={14} />
            <span>New Milestone</span>
          </button>

          {/* New Goal Button */}
          <button
            onClick={() => setIsNewGoalOpen(true)}
            className="flex items-center gap-1.5 bg-white border border-border text-ink rounded-xl px-3.5 py-2 text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            <Target size={14} className="text-slate" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* ── 2. AI Roadmap Generator Collapsible Box ──────────────────────────── */}
      {isAiOpen && (
        <div className="bg-white rounded-2xl border border-blue/30 shadow-xs p-5 space-y-4 animate-in fade-in zoom-in-98 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue/10 border border-blue/20 flex items-center justify-center">
                <Sparkles size={16} className="text-blue" />
              </div>
              <div>
                <h3 className="font-bold text-ink text-sm">AI Milestone & Roadmap Synthesizer</h3>
                <p className="text-xs text-slate">
                  Enter high-level goals or user feedback to automatically generate structured milestones and dates.
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAiOpen(false)}
              className="text-xs text-muted hover:text-ink px-2 py-1 rounded-lg"
            >
              Close
            </button>
          </div>

          <textarea
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="e.g. Build an app called EduLaod: a digital library for Engineering students in FUOYE so they can download course materials online before exam season, with AI CBT generation..."
            rows={3}
            className="w-full border border-border rounded-xl px-4 py-2.5 text-xs text-ink placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
          />

          {aiError && <p className="text-xs text-danger font-medium">{aiError}</p>}

          <div className="flex items-center justify-between">
            <button
              onClick={generateRoadmap}
              disabled={!aiInput.trim() || aiLoading}
              className="flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-blue-mid transition-all disabled:opacity-50"
            >
              <Zap size={13} />
              {aiLoading ? "Generating Roadmap…" : "Generate Milestones"}
            </button>

            {aiResult && (
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                ✨ {aiResult.milestones.length} milestones suggested
              </span>
            )}
          </div>

          {/* AI Result Review Box */}
          {aiResult && (
            <div className="p-4 bg-slate-50 border border-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-ink uppercase tracking-wider">
                  Review & Select Target Goal:
                </h4>
                {aiResult.goalTitle && (
                  <span className="text-xs text-blue font-medium flex items-center gap-1">
                    <Sparkles size={12} /> Suggested Goal: &quot;{aiResult.goalTitle}&quot;
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {aiResult.milestones.map((m, i) => (
                  <div key={i} className="bg-white border border-border rounded-xl p-2.5 text-xs space-y-1">
                    <div className="font-semibold text-ink">{m.title}</div>
                    <div className="text-[11px] text-muted line-clamp-2">{m.description}</div>
                    {m.targetDate && (
                      <div className="text-[10px] text-blue font-medium pt-1">
                        Target: {new Date(m.targetDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <select
                  value={commitGoalId ?? ""}
                  onChange={(e) => setCommitGoalId(e.target.value)}
                  className="w-full sm:w-80 bg-white border border-border rounded-xl px-3 py-2 text-xs text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
                >
                  <option value="" disabled>
                    Select target goal…
                  </option>
                  {aiResult.goalTitle && (
                    <option value="__NEW_AI_GOAL__" className="font-semibold text-blue">
                      ✨ Create new goal: &quot;{aiResult.goalTitle}&quot;
                    </option>
                  )}
                  {goals.length > 0 && (
                    <optgroup label="Existing Goals">
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    disabled={!commitGoalId || commitLoading}
                    onClick={async () => {
                      if (!commitGoalId || !aiResult) return;
                      setCommitLoading(true);
                      setAiError("");

                      try {
                        const payload =
                          commitGoalId === "__NEW_AI_GOAL__"
                            ? {
                                generationId: aiResult.generationId,
                                newGoal: {
                                  title: aiResult.goalTitle || "New Project Roadmap",
                                  objective: aiResult.goalObjective || "Generated from AI Roadmap Synthesizer",
                                  status: "active",
                                },
                                milestones: aiResult.milestones,
                              }
                            : {
                                generationId: aiResult.generationId,
                                goalId: commitGoalId,
                                milestones: aiResult.milestones,
                              };

                        const res = await fetch("/api/ai/roadmap-generator/commit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                        });

                        if (res.ok) {
                          setAiResult(null);
                          setCommitGoalId(null);
                          setIsAiOpen(false);
                          window.location.reload();
                        } else {
                          const data = await res.json();
                          setAiError(data.error || "Failed to commit milestones.");
                        }
                      } catch (err) {
                        console.error("Commit error:", err);
                        setAiError("Network error while committing milestones.");
                      } finally {
                        setCommitLoading(false);
                      }
                    }}
                    className="flex-1 sm:flex-none bg-blue text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-blue-mid transition-all disabled:opacity-50"
                  >
                    {commitLoading
                      ? commitGoalId === "__NEW_AI_GOAL__"
                        ? "Creating Goal…"
                        : "Applying…"
                      : "Apply to Roadmap"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiResult(null);
                      setCommitGoalId(null);
                    }}
                    className="px-3 py-2 border border-border text-xs text-slate hover:bg-white rounded-xl"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 3. Plan Gate (if on Free tier) ──────────────────────────────────── */}
      {isGated ? (
        <div className="bg-white rounded-2xl border border-border p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600">
            <Lock size={24} />
          </div>
          <h3 className="font-bold text-ink text-base">Timeline & Gantt Canvas Requires Startup Tier</h3>
          <p className="text-xs text-slate max-w-md mx-auto">{upgradePrompt}</p>
          <Link
            href={`/workspace/${workspaceId}/settings`}
            className="inline-flex items-center gap-1.5 bg-blue text-white rounded-xl px-5 py-2.5 text-xs font-semibold hover:bg-blue-mid transition-colors shadow-xs"
          >
            Upgrade Plan <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* ── 4. Interactive Gantt Controls Bar ──────────────────────────────── */}
          <div className="bg-white border border-border rounded-2xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            {/* Left Controls: Time scale switcher & Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Time Scale Buttons */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-border/80">
                {(["day", "week", "month"] as TimeScale[]).map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setTimeScale(scale)}
                    className={`px-3 py-1 text-xs font-bold capitalize rounded-lg transition-all ${
                      timeScale === scale
                        ? "bg-white text-ink shadow-xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {scale}
                  </button>
                ))}
              </div>

              {/* Critical Path Toggle */}
              <button
                onClick={() => setHighlightCriticalPath((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  highlightCriticalPath
                    ? "bg-rose-50 border-rose-300 text-rose-700 shadow-2xs"
                    : "bg-white border-border text-slate hover:text-ink hover:bg-slate-50"
                }`}
                title="Highlight zero-slack critical bottleneck path"
              >
                <Flame
                  size={14}
                  className={highlightCriticalPath ? "text-rose-600 animate-pulse" : "text-slate"}
                />
                <span>Critical Path</span>
              </button>

              {/* Baseline Drift Toggle */}
              <button
                onClick={() => setShowBaseline((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  showBaseline
                    ? "bg-blue-faint border-blue-light text-blue shadow-2xs"
                    : "bg-white border-border text-slate hover:text-ink hover:bg-slate-50"
                }`}
                title="Show schedule variance against original baseline target"
              >
                <GitCommit size={14} className={showBaseline ? "text-blue" : "text-slate"} />
                <span>Baseline Drift</span>
              </button>

              {/* Snapshot Baseline Button */}
              <button
                onClick={handleSnapshotBaseline}
                disabled={baselineLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs text-slate hover:text-ink hover:bg-slate-100 transition-colors border border-transparent hover:border-border"
                title="Set current roadmap dates as the approved baseline"
              >
                <Camera size={13} className="text-slate" />
                <span>{baselineLoading ? "Snapshotting…" : "Snapshot"}</span>
              </button>

              {baselineSuccess && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 size={12} /> Saved!
                </span>
              )}
            </div>

            {/* Right Controls: Search & Status Filter */}
            <div className="flex items-center gap-2">
              {/* Search Bar */}
              <div className="relative flex-1 md:w-48">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter milestones…"
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-border rounded-xl focus:outline-none focus:bg-white focus:border-blue"
                />
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 bg-slate-50 border border-border px-2.5 py-1.5 rounded-xl">
                <Filter size={12} className="text-muted" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-xs bg-transparent text-ink font-medium cursor-pointer focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── 5. Main Interactive Gantt Canvas Component ───────────────────── */}
          <InteractiveGantt
            workspaceId={workspaceId}
            goals={goals}
            timeScale={timeScale}
            highlightCriticalPath={highlightCriticalPath}
            showBaseline={showBaseline}
            searchQuery={searchQuery}
            filterStatus={filterStatus}
            onRefreshData={handleRefresh}
            onAddMilestoneClick={(goalId) => {
              setSelectedGoalForMilestone(goalId);
              setIsNewMilestoneOpen(true);
            }}
          />
        </>
      )}

      {/* ── 6. Modals ───────────────────────────────────────────────────────── */}
      <NewMilestoneModal
        isOpen={isNewMilestoneOpen}
        workspaceId={workspaceId}
        defaultGoalId={selectedGoalForMilestone}
        goals={goals.map((g) => ({ id: g.id, title: g.title }))}
        allMilestones={allMilestones}
        onClose={() => setIsNewMilestoneOpen(false)}
        onCreateGoalClick={() => setIsNewGoalOpen(true)}
        onCreated={(newMilestone) => {
          setGoals((prev) =>
            prev.map((g) =>
              g.id === newMilestone.goalId
                ? { ...g, milestones: [...g.milestones, newMilestone] }
                : g
            )
          );
        }}
      />

      {isNewGoalOpen && (
        <NewGoalModal
          workspaceId={workspaceId}
          onClose={() => setIsNewGoalOpen(false)}
          onCreated={(newGoal) => {
            setGoals((prev) => [
              ...prev,
              {
                id: newGoal.id,
                title: newGoal.title,
                objective: newGoal.objective,
                status: newGoal.status,
                targetDate: newGoal.targetDate,
                milestones: [],
              },
            ]);
          }}
        />
      )}
    </div>
  );
}
