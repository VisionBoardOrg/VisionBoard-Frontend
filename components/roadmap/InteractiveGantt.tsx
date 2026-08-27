"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  TimeScale,
  GanttMilestone,
  getTimelineBounds,
  generateTimeHeaders,
  dateToPixel,
  calculateCriticalPath,
  calculateCascadeShifts,
  normalizeDate,
  addDays,
  diffDays,
  CascadeShiftItem,
} from "@/lib/gantt-engine";
import { GanttDependencyLayer, MilestonePosition } from "./GanttDependencyLayer";
import { MilestoneDetailDrawer } from "./MilestoneDetailDrawer";
import { CascadePromptModal } from "./CascadePromptModal";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Target,
  Compass,
} from "lucide-react";

export interface GoalGroup {
  id: string;
  title: string;
  objective: string;
  status: string;
  targetDate: Date | string | null;
  milestones: GanttMilestone[];
}

interface InteractiveGanttProps {
  workspaceId: string;
  goals: GoalGroup[];
  timeScale: TimeScale;
  highlightCriticalPath: boolean;
  showBaseline: boolean;
  filterStatus?: string;
  searchQuery?: string;
  onRefreshData?: () => void;
  onAddMilestoneClick?: (goalId: string) => void;
}

const ROW_HEIGHT = 44;
const GOAL_HEADER_HEIGHT = 42;
const SIDEBAR_WIDTH = 260;

const STATUS_THEMES: Record<
  string,
  { bg: string; border: string; text: string; barBg: string }
> = {
  completed: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    text: "text-emerald-800",
    barBg: "bg-emerald-500",
  },
  in_progress: {
    bg: "bg-blue/15",
    border: "border-blue/40",
    text: "text-blue",
    barBg: "bg-blue",
  },
  planned: {
    bg: "bg-slate-100",
    border: "border-slate-300",
    text: "text-slate-700",
    barBg: "bg-slate-500",
  },
  delayed: {
    bg: "bg-rose-50",
    border: "border-rose-300",
    text: "text-rose-800",
    barBg: "bg-rose-500",
  },
};

export function InteractiveGantt({
  workspaceId,
  goals: initialGoals,
  timeScale,
  highlightCriticalPath,
  showBaseline,
  filterStatus,
  searchQuery = "",
  onRefreshData,
  onAddMilestoneClick,
}: InteractiveGanttProps) {
  const [goals, setGoals] = useState<GoalGroup[]>(initialGoals);

  useEffect(() => {
    setGoals(initialGoals);
  }, [initialGoals]);
  const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(new Set());
  const [selectedMilestone, setSelectedMilestone] = useState<GanttMilestone | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Cascade prompt state
  const [cascadeShifts, setCascadeShifts] = useState<CascadeShiftItem[]>([]);
  const [pendingCascadeMilestone, setPendingCascadeMilestone] = useState<{
    id: string;
    title: string;
    startDate: Date;
    targetDate: Date;
  } | null>(null);
  const [isCascadeModalOpen, setIsCascadeModalOpen] = useState(false);
  const [isSubmittingCascade, setIsSubmittingCascade] = useState(false);

  // Dragging & Resizing interaction state
  const [dragState, setDragState] = useState<{
    type: "move" | "resize-left" | "resize-right";
    milestoneId: string;
    startX: number;
    originalStart: Date;
    originalTarget: Date;
    currentStart: Date;
    currentTarget: Date;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollableTimelineRef = useRef<HTMLDivElement>(null);

  // Flatten all milestones across goals
  const allMilestones = useMemo(() => {
    return goals.flatMap((g) =>
      g.milestones.map((m) => ({ ...m, goalId: g.id, goalTitle: g.title }))
    );
  }, [goals]);

  // Filtered milestones based on search and status filters
  const filteredGoals = useMemo(() => {
    return goals
      .map((g) => {
        const matchesGoal =
          !searchQuery ||
          g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.objective.toLowerCase().includes(searchQuery.toLowerCase());

        const filteredMs = g.milestones.filter((m) => {
          const matchesStatus = !filterStatus || filterStatus === "all" || m.status === filterStatus;
          const matchesSearch =
            !searchQuery ||
            matchesGoal ||
            m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (m.description || "").toLowerCase().includes(searchQuery.toLowerCase());
          return matchesStatus && matchesSearch;
        });

        return { ...g, milestones: filteredMs };
      })
      .filter((g) => g.milestones.length > 0 || !searchQuery);
  }, [goals, filterStatus, searchQuery]);

  // Timeline bounds calculation
  const { timelineStart, timelineEnd } = useMemo(() => {
    const extraGoalDates = goals.map((g) => g.targetDate);
    return getTimelineBounds(allMilestones, extraGoalDates, timeScale);
  }, [allMilestones, goals, timeScale]);

  // Time header intervals
  const { topHeaders, subHeaders, totalWidth } = useMemo(() => {
    return generateTimeHeaders(timelineStart, timelineEnd, timeScale);
  }, [timelineStart, timelineEnd, timeScale]);

  // Critical Path calculation
  const { criticalMilestoneIds, criticalDependencyPairs } = useMemo(() => {
    return calculateCriticalPath(allMilestones);
  }, [allMilestones]);

  // Flat list of dependencies
  const dependencies = useMemo(() => {
    const deps: Array<{ predecessorId: string; successorId: string }> = [];
    for (const m of allMilestones) {
      for (const predId of m.dependsOn || []) {
        deps.push({ predecessorId: predId, successorId: m.id });
      }
    }
    return deps;
  }, [allMilestones]);

  // Today marker line position
  const todayPixel = useMemo(() => {
    return dateToPixel(new Date(), timelineStart, timeScale);
  }, [timelineStart, timeScale]);

  // Calculate pixel bounding boxes for all visible milestones to render SVG dependencies
  const milestonePositions = useMemo(() => {
    const positions = new Map<string, MilestonePosition>();
    let currentTop = 0;

    for (const goal of filteredGoals) {
      // Goal header row
      currentTop += GOAL_HEADER_HEIGHT;

      if (!collapsedGoals.has(goal.id)) {
        for (const ms of goal.milestones) {
          const s = normalizeDate(ms.startDate) || normalizeDate(ms.targetDate) || new Date();
          const t = normalizeDate(ms.targetDate) || addDays(s, 7);

          const left = dateToPixel(s, timelineStart, timeScale);
          const right = dateToPixel(t, timelineStart, timeScale);
          const width = Math.max(36, right - left);

          positions.set(ms.id, {
            id: ms.id,
            left,
            width,
            top: currentTop + (ROW_HEIGHT - 28) / 2,
            height: 28,
            isMilestone: true,
          });

          currentTop += ROW_HEIGHT;
        }
      }
    }

    return { positions, totalCanvasHeight: currentTop };
  }, [filteredGoals, collapsedGoals, timelineStart, timeScale]);

  // Toggle Goal Collapse
  function toggleGoalCollapse(goalId: string) {
    setCollapsedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  }

  // Scroll to Today
  const scrollToToday = useCallback(() => {
    if (scrollableTimelineRef.current) {
      const clientWidth = scrollableTimelineRef.current.clientWidth;
      scrollableTimelineRef.current.scrollTo({
        left: Math.max(0, todayPixel - clientWidth / 2),
        behavior: "smooth",
      });
    }
  }, [todayPixel]);

  // Initial scroll to today or first milestone on mount
  useEffect(() => {
    scrollToToday();
  }, [scrollToToday]);

  // ── Drag & Resize Mouse Handlers ──────────────────────────────────────────

  function startDrag(
    e: React.MouseEvent,
    milestone: GanttMilestone,
    type: "move" | "resize-left" | "resize-right"
  ) {
    e.stopPropagation();
    e.preventDefault();

    const start = normalizeDate(milestone.startDate) || normalizeDate(milestone.targetDate) || new Date();
    const target = normalizeDate(milestone.targetDate) || addDays(start, 7);

    setDragState({
      type,
      milestoneId: milestone.id,
      startX: e.clientX,
      originalStart: start,
      originalTarget: target,
      currentStart: start,
      currentTarget: target,
    });
  }

  // Direct single milestone update
  const updateMilestoneDirect = useCallback(
    async (id: string, data: Partial<GanttMilestone>): Promise<void> => {
      // Optimistic UI update
      setGoals((prevGoals) =>
        prevGoals.map((g) => ({
          ...g,
          milestones: g.milestones.map((m) => (m.id === id ? { ...m, ...data } : m)),
        }))
      );

      try {
        const res = await fetch(`/api/milestones/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startDate: data.startDate ? new Date(data.startDate).toISOString() : undefined,
            targetDate: data.targetDate ? new Date(data.targetDate).toISOString() : undefined,
            title: data.title,
            description: data.description,
            status: data.status,
            dependsOn: data.dependsOn,
            goalId: data.goalId,
          }),
        });

        if (!res.ok) {
          console.error("Failed to update milestone on server");
          onRefreshData?.();
        }
      } catch (err) {
        console.error("Milestone update error:", err);
        onRefreshData?.();
      }
    },
    [onRefreshData]
  );

  useEffect(() => {
    if (!dragState) return;

    let rafId: number | null = null;

    function handleMouseMove(e: MouseEvent) {
      if (!dragState) return;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        const deltaX = e.clientX - dragState.startX;
        const daysDelta = Math.round(
          deltaX / (timeScale === "day" ? 44 : timeScale === "week" ? 16 : 5.3)
        );

        if (dragState.type === "move") {
          const nextStart = addDays(dragState.originalStart, daysDelta);
          const nextTarget = addDays(dragState.originalTarget, daysDelta);
          setDragState((prev) =>
            prev ? { ...prev, currentStart: nextStart, currentTarget: nextTarget } : null
          );
        } else if (dragState.type === "resize-left") {
          const nextStart = addDays(dragState.originalStart, daysDelta);
          if (nextStart < dragState.originalTarget) {
            setDragState((prev) => (prev ? { ...prev, currentStart: nextStart } : null));
          }
        } else if (dragState.type === "resize-right") {
          const nextTarget = addDays(dragState.originalTarget, daysDelta);
          if (nextTarget > dragState.originalStart) {
            setDragState((prev) => (prev ? { ...prev, currentTarget: nextTarget } : null));
          }
        }
      });
    }

    async function handleMouseUp() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (!dragState) return;

      const { milestoneId, currentStart, currentTarget, originalStart, originalTarget } =
        dragState;

      // Check if dates actually changed
      const hasChanged =
        diffDays(currentStart, originalStart) !== 0 ||
        diffDays(currentTarget, originalTarget) !== 0;

      setDragState(null);

      if (!hasChanged) return;

      const targetMilestone = allMilestones.find((m) => m.id === milestoneId);
      if (!targetMilestone) return;

      // Compute cascade shifts
      const shifts = calculateCascadeShifts(
        allMilestones,
        milestoneId,
        currentStart,
        currentTarget
      );

      if (shifts.length > 0) {
        // Prompt user to cascade
        setCascadeShifts(shifts);
        setPendingCascadeMilestone({
          id: milestoneId,
          title: targetMilestone.title,
          startDate: currentStart,
          targetDate: currentTarget,
        });
        setIsCascadeModalOpen(true);
      } else {
        // Direct single milestone update
        await updateMilestoneDirect(milestoneId, {
          startDate: currentStart,
          targetDate: currentTarget,
        });
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, allMilestones, timeScale, updateMilestoneDirect]);

  // Handle Cascade shifts batch apply
  async function handleApplyCascade() {
    if (!pendingCascadeMilestone) return;
    setIsSubmittingCascade(true);

    const payloadShifts = [
      {
        milestoneId: pendingCascadeMilestone.id,
        startDate: pendingCascadeMilestone.startDate.toISOString(),
        targetDate: pendingCascadeMilestone.targetDate.toISOString(),
      },
      ...cascadeShifts.map((s) => ({
        milestoneId: s.milestoneId,
        startDate: s.newStartDate.toISOString(),
        targetDate: s.newTargetDate.toISOString(),
      })),
    ];

    try {
      const res = await fetch("/api/milestones/batch-reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          shifts: payloadShifts,
        }),
      });

      if (res.ok) {
        setIsCascadeModalOpen(false);
        setCascadeShifts([]);
        setPendingCascadeMilestone(null);
        onRefreshData?.();
      } else {
        alert("Failed to apply cascade rescheduling.");
      }
    } catch (err) {
      console.error("Cascade reschedule error:", err);
    } finally {
      setIsSubmittingCascade(false);
    }
  }

  // Handle delete milestone
  async function handleDeleteMilestone(id: string): Promise<void> {
    setGoals((prev) =>
      prev.map((g) => ({
        ...g,
        milestones: g.milestones.filter((m) => m.id !== id),
      }))
    );

    try {
      await fetch(`/api/milestones/${id}`, { method: "DELETE" });
      onRefreshData?.();
    } catch (err) {
      console.error("Delete milestone error:", err);
      onRefreshData?.();
    }
  }

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-2xl border border-border overflow-hidden shadow-xs flex flex-col select-none"
    >
      {/* Scrollable Layout Container: Fixed Sidebar + Timeline Grid */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ── 1. Left Sidebar: Goals & Milestones Tree ────────────────────────── */}
        <div
          className="shrink-0 border-r border-border bg-slate-50/50 flex flex-col z-20"
          style={{ width: SIDEBAR_WIDTH }}
        >
          {/* Header Row */}
          <div className="h-16 px-4 border-b border-border flex items-center justify-between bg-slate-50 font-bold text-xs text-ink uppercase tracking-wider">
            <span>Goal / Milestone</span>
            <button
              onClick={scrollToToday}
              className="text-[11px] font-semibold text-blue hover:text-blue-mid flex items-center gap-1 bg-blue-faint px-2 py-1 rounded-lg transition-colors"
              title="Jump timeline to Today"
            >
              <Compass size={12} /> Today
            </button>
          </div>

          {/* Goal & Milestone Rows */}
          <div className="overflow-hidden">
            {filteredGoals.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted space-y-2">
                <Target size={20} className="text-slate-300 mx-auto" />
                <p className="font-medium text-slate">No goals to display.</p>
                <p className="text-[11px] text-muted">Create a goal or generate a roadmap with AI to get started.</p>
              </div>
            ) : (
              filteredGoals.map((goal) => {
                const isCollapsed = collapsedGoals.has(goal.id);
                const completedCount = goal.milestones.filter((m) => m.status === "completed").length;
                const progressPct =
                  goal.milestones.length > 0
                    ? Math.round((completedCount / goal.milestones.length) * 100)
                    : 0;

                return (
                  <div key={goal.id} className="border-b border-border last:border-b-0">
                    {/* Goal Header Row */}
                    <div
                      className="flex items-center justify-between px-3 hover:bg-slate-100/70 transition-colors cursor-pointer"
                      style={{ height: GOAL_HEADER_HEIGHT }}
                      onClick={() => toggleGoalCollapse(goal.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button className="text-muted hover:text-ink p-0.5">
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <Target size={14} className="text-blue shrink-0" />
                        <span className="font-bold text-ink text-xs truncate" title={goal.title}>
                          {goal.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-semibold text-muted bg-white border border-border px-1.5 py-0.5 rounded-md">
                          {progressPct}%
                        </span>
                        {onAddMilestoneClick && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddMilestoneClick(goal.id);
                            }}
                            className="p-1 text-muted hover:text-blue hover:bg-white rounded-md transition-colors"
                            title="Add Milestone"
                          >
                            <Plus size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Milestones List */}
                    {!isCollapsed && (
                      <div>
                        {goal.milestones.map((ms) => {
                          const isCritical =
                            highlightCriticalPath && criticalMilestoneIds.has(ms.id);

                          return (
                            <div
                              key={ms.id}
                              style={{ height: ROW_HEIGHT }}
                              className="flex items-center justify-between pl-8 pr-3 border-t border-border/40 hover:bg-blue-faint/30 transition-colors cursor-pointer group"
                              onClick={() => {
                                setSelectedMilestone(ms);
                                setIsDrawerOpen(true);
                              }}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    STATUS_THEMES[ms.status]?.barBg || "bg-slate-400"
                                  }`}
                                />
                                <span
                                  className={`text-xs truncate ${
                                    isCritical ? "font-bold text-rose-700" : "text-slate font-medium"
                                  } group-hover:text-blue transition-colors`}
                                  title={ms.title}
                                >
                                  {ms.title}
                                </span>
                              </div>

                              {isCritical && (
                                <span className="text-[9px] font-bold uppercase text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded-md shrink-0">
                                  Critical
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── 2. Right Canvas: Scrollable Timeline Grid ──────────────────────── */}
        <div
          ref={scrollableTimelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative bg-white"
        >
          <div style={{ width: totalWidth, minWidth: "100%" }} className="relative">
            {/* Timeline Header (2-tier date scales) */}
            <div className="h-16 border-b border-border sticky top-0 bg-white/95 backdrop-blur-xs z-10">
              {/* Top Tier (Years / Quarters / Months) */}
              <div className="h-8 flex border-b border-border/60">
                {topHeaders.map((header) => (
                  <div
                    key={header.id}
                    style={{ left: header.left, width: header.width }}
                    className="absolute h-8 px-2 flex items-center font-bold text-[11px] text-ink border-r border-border/40 truncate"
                  >
                    {header.label}
                  </div>
                ))}
              </div>

              {/* Sub Tier (Months / Weeks / Days) */}
              <div className="h-8 flex relative">
                {subHeaders.map((sub) => (
                  <div
                    key={sub.id}
                    style={{ left: sub.left, width: sub.width }}
                    className={`absolute h-8 flex flex-col items-center justify-center text-[10px] border-r border-border/30 ${
                      sub.isToday
                        ? "bg-blue/10 font-bold text-blue"
                        : "text-muted font-medium"
                    }`}
                  >
                    <span>{sub.label}</span>
                    {sub.subLabel && (
                      <span className="text-[8px] text-muted -mt-0.5">{sub.subLabel}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Canvas Body with Vertical Grid Lines */}
            <div
              className="relative"
              style={{ height: milestonePositions.totalCanvasHeight || 400 }}
            >
              {/* Vertical Column Grid Lines */}
              {subHeaders.map((sub) => (
                <div
                  key={`grid-${sub.id}`}
                  style={{ left: sub.left }}
                  className={`absolute top-0 bottom-0 w-px ${
                    sub.isToday ? "bg-blue/30" : "bg-border/30"
                  }`}
                />
              ))}

              {/* Today Vertical Marker Line with Pill Badge */}
              <div
                style={{ left: todayPixel }}
                className="absolute top-0 bottom-0 w-0.5 bg-blue z-10 pointer-events-none"
              >
                <div className="sticky top-16 -ml-5 bg-blue text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-xs">
                  TODAY
                </div>
              </div>

              {/* SVG Dependencies Layer */}
              <GanttDependencyLayer
                positions={milestonePositions.positions}
                dependencies={dependencies}
                criticalPairs={criticalDependencyPairs}
                highlightCriticalPath={highlightCriticalPath}
                totalWidth={totalWidth}
                totalHeight={milestonePositions.totalCanvasHeight}
                onSelectDependency={(predId) => {
                  const ms = allMilestones.find((m) => m.id === predId);
                  if (ms) {
                    setSelectedMilestone(ms);
                    setIsDrawerOpen(true);
                  }
                }}
              />

              {/* Render Rows and Milestone Bars */}
              {filteredGoals.map((goal) => {
                const isCollapsed = collapsedGoals.has(goal.id);

                return (
                  <div key={`canvas-${goal.id}`}>
                    {/* Goal Row Background */}
                    <div
                      style={{ height: GOAL_HEADER_HEIGHT }}
                      className="border-b border-border/60 bg-slate-50/40 relative"
                    >
                      {/* Optional Goal Target Marker */}
                      {goal.targetDate && (
                        <div
                          style={{
                            left: dateToPixel(goal.targetDate, timelineStart, timeScale) - 10,
                          }}
                          className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1 bg-white border border-blue/40 text-blue px-2 py-0.5 rounded-full text-[10px] font-bold shadow-2xs z-5"
                        >
                          <Target size={11} />
                          <span>Goal Target</span>
                        </div>
                      )}
                    </div>

                    {/* Milestone Bars */}
                    {!isCollapsed &&
                      goal.milestones.map((ms) => {
                        const isDraggingCurrent =
                          dragState?.milestoneId === ms.id;

                        const s = isDraggingCurrent
                          ? dragState.currentStart
                          : normalizeDate(ms.startDate) ||
                            normalizeDate(ms.targetDate) ||
                            new Date();

                        const t = isDraggingCurrent
                          ? dragState.currentTarget
                          : normalizeDate(ms.targetDate) || addDays(s, 7);

                        const left = dateToPixel(s, timelineStart, timeScale);
                        const right = dateToPixel(t, timelineStart, timeScale);
                        const width = Math.max(36, right - left);
                        const duration = Math.max(1, diffDays(t, s));

                        const isCritical =
                          highlightCriticalPath && criticalMilestoneIds.has(ms.id);
                        const theme = STATUS_THEMES[ms.status] || STATUS_THEMES.planned;

                        // Baseline ghost bar coordinates
                        const hasBaseline =
                          showBaseline &&
                          (ms.baselineStartDate || ms.baselineTargetDate);
                        const bStart =
                          normalizeDate(ms.baselineStartDate) ||
                          normalizeDate(ms.baselineTargetDate);
                        const bTarget =
                          normalizeDate(ms.baselineTargetDate) ||
                          (bStart ? addDays(bStart, 7) : null);
                        const bLeft = bStart
                          ? dateToPixel(bStart, timelineStart, timeScale)
                          : 0;
                        const bRight = bTarget
                          ? dateToPixel(bTarget, timelineStart, timeScale)
                          : 0;
                        const bWidth = Math.max(36, bRight - bLeft);

                        return (
                          <div
                            key={`row-${ms.id}`}
                            style={{ height: ROW_HEIGHT }}
                            className="border-b border-border/30 relative flex items-center group/row hover:bg-blue-faint/10 transition-colors"
                          >
                            {/* Baseline Ghost Bar (if active) */}
                            {hasBaseline && (
                              <div
                                style={{ left: bLeft, width: bWidth }}
                                className="absolute h-5 top-1/2 -translate-y-1/2 rounded-lg border border-dashed border-slate-400 bg-slate-100/50 pointer-events-none z-1"
                                title="Original baseline target"
                              />
                            )}

                            {/* Main Interactive Milestone Bar */}
                            <div
                              style={{ left, width }}
                              onMouseDown={(e) => startDrag(e, ms, "move")}
                              onClick={() => {
                                setSelectedMilestone(ms);
                                setIsDrawerOpen(true);
                              }}
                              className={`absolute h-7 rounded-xl flex items-center justify-between px-2.5 cursor-grab active:cursor-grabbing transition-shadow z-5 shadow-xs border ${
                                theme.bg
                              } ${theme.border} ${theme.text} ${
                                isCritical
                                  ? "ring-2 ring-rose-500 shadow-rose-200"
                                  : "hover:shadow-md"
                              } ${isDraggingCurrent ? "opacity-90 ring-2 ring-blue" : ""}`}
                            >
                              {/* Left Resize Handle */}
                              <div
                                onMouseDown={(e) => startDrag(e, ms, "resize-left")}
                                className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-ink/20 rounded-l-xl transition-colors"
                                title="Drag to adjust start date"
                              />

                              {/* Content Label */}
                              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden pointer-events-none">
                                <div
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.barBg}`}
                                />
                                <span className="text-[11px] font-bold truncate">
                                  {ms.title}
                                </span>
                              </div>

                              {/* Duration Pill */}
                              <span className="text-[9px] font-semibold opacity-75 shrink-0 ml-1.5 bg-white/70 px-1 py-0.2 rounded">
                                {duration}d
                              </span>

                              {/* Right Resize Handle */}
                              <div
                                onMouseDown={(e) => startDrag(e, ms, "resize-right")}
                                className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-ink/20 rounded-r-xl transition-colors"
                                title="Drag to adjust target date"
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Slide-over Milestone Detail Drawer ───────────────────────────── */}
      <MilestoneDetailDrawer
        isOpen={isDrawerOpen}
        milestone={selectedMilestone}
        allMilestones={allMilestones}
        goals={goals.map((g) => ({ id: g.id, title: g.title }))}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedMilestone(null);
        }}
        onUpdate={updateMilestoneDirect}
        onDelete={handleDeleteMilestone}
      />

      {/* ── 4. Cascade Auto-Scheduling Confirmation Modal ───────────────────── */}
      <CascadePromptModal
        isOpen={isCascadeModalOpen}
        shiftedMilestoneTitle={pendingCascadeMilestone?.title || ""}
        shifts={cascadeShifts}
        isSubmitting={isSubmittingCascade}
        onApplyCascade={handleApplyCascade}
        onApplySingleOnly={async () => {
          if (pendingCascadeMilestone) {
            await updateMilestoneDirect(pendingCascadeMilestone.id, {
              startDate: pendingCascadeMilestone.startDate,
              targetDate: pendingCascadeMilestone.targetDate,
            });
            setIsCascadeModalOpen(false);
            setCascadeShifts([]);
            setPendingCascadeMilestone(null);
          }
        }}
        onCancel={() => {
          setIsCascadeModalOpen(false);
          setCascadeShifts([]);
          setPendingCascadeMilestone(null);
        }}
      />
    </div>
  );
}
