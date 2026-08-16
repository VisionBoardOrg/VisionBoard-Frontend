/**
 * VisionBoard Gantt & Dependency Engine
 * High-performance pure mathematical and algorithmic helpers for:
 * - Time scale grid coordinate mapping (Day / Week / Month)
 * - Directed Acyclic Graph (DAG) cycle detection
 * - Critical Path Method (CPM) with Early/Late start & Float analysis
 * - Cascade auto-scheduling & downstream slippage propagation
 * - SVG directional dependency connector curves
 * - Baseline variance & schedule drift calculation
 */

export type TimeScale = "day" | "week" | "month";

export interface GanttMilestone {
  id: string;
  goalId: string;
  goalTitle?: string;
  title: string;
  description?: string | null;
  status: string;
  startDate: Date | string | null;
  targetDate: Date | string | null;
  baselineStartDate?: Date | string | null;
  baselineTargetDate?: Date | string | null;
  dependsOn: string[];
  order: number;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    dueDate?: Date | string | null;
  }>;
}

export interface TimeHeaderCell {
  id: string;
  label: string;
  subLabel?: string;
  startDate: Date;
  endDate: Date;
  width: number;
  left: number;
  isToday?: boolean;
}

export interface CascadeShiftItem {
  milestoneId: string;
  title: string;
  oldStartDate: Date | null;
  oldTargetDate: Date | null;
  newStartDate: Date;
  newTargetDate: Date;
  shiftDays: number;
}

export interface CriticalPathResult {
  criticalMilestoneIds: Set<string>;
  criticalDependencyPairs: Set<string>; // "predecessorId->successorId"
  slackDaysMap: Map<string, number>;
}

export interface BaselineVarianceResult {
  driftDays: number;
  label: string;
  status: "ahead" | "on_track" | "delayed" | "no_baseline";
}

// ── 1. Coordinate & Grid Calculations ────────────────────────────────────────

export function getScaleColumnWidth(scale: TimeScale): number {
  switch (scale) {
    case "day":
      return 44; // px per day
    case "week":
      return 112; // px per 7-day week (16px per day)
    case "month":
      return 160; // px per month (~5.3px per day)
  }
}

export function getPixelsPerDay(scale: TimeScale): number {
  switch (scale) {
    case "day":
      return 44;
    case "week":
      return 112 / 7;
    case "month":
      return 160 / 30;
  }
}

export function normalizeDate(dateInput: Date | string | null | undefined): Date | null {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  // Standardize to midnight UTC/local
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(date: Date, days: number): Date {
  const res = new Date(date);
  res.setDate(res.getDate() + days);
  return res;
}

export function diffDays(dateA: Date, dateB: Date): number {
  const normA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
  const normB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
  const diffTime = normA.getTime() - normB.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculates the bounding start and end dates for the Gantt view.
 */
export function getTimelineBounds(
  milestones: GanttMilestone[],
  extraDates: Array<Date | string | null | undefined> = [],
  scale: TimeScale = "month"
): { timelineStart: Date; timelineEnd: Date; totalDays: number } {
  const now = new Date();
  const allDates: number[] = [now.getTime()];

  for (const m of milestones) {
    const s = normalizeDate(m.startDate);
    const t = normalizeDate(m.targetDate);
    if (s) allDates.push(s.getTime());
    if (t) allDates.push(t.getTime());
  }

  for (const d of extraDates) {
    const norm = normalizeDate(d);
    if (norm) allDates.push(norm.getTime());
  }

  const minTime = Math.min(...allDates);
  const maxTime = Math.max(...allDates);

  const rawMin = new Date(minTime);
  const rawMax = new Date(maxTime);

  let timelineStart: Date;
  let timelineEnd: Date;

  if (scale === "day") {
    // 7 days before min, 14 days after max
    timelineStart = addDays(rawMin, -7);
    timelineEnd = addDays(rawMax, 14);
  } else if (scale === "week") {
    // Snap to Monday 2 weeks before, 4 weeks after
    const startOffset = (rawMin.getDay() + 6) % 7;
    timelineStart = addDays(rawMin, -startOffset - 14);
    timelineEnd = addDays(rawMax, 28);
  } else {
    // Month scale: start on 1st of month before, end on last of month 3 months after
    timelineStart = new Date(rawMin.getFullYear(), rawMin.getMonth() - 1, 1);
    timelineEnd = new Date(rawMax.getFullYear(), rawMax.getMonth() + 4, 0);
  }

  const totalDays = Math.max(1, diffDays(timelineEnd, timelineStart));
  return { timelineStart, timelineEnd, totalDays };
}

/**
 * Maps a date to an X pixel coordinate relative to the timeline start.
 */
export function dateToPixel(
  dateInput: Date | string | null | undefined,
  timelineStart: Date,
  scale: TimeScale
): number {
  const date = normalizeDate(dateInput);
  if (!date) return 0;
  const days = diffDays(date, timelineStart);
  return Math.max(0, days * getPixelsPerDay(scale));
}

/**
 * Maps an X pixel coordinate back to a Date.
 */
export function pixelToDate(
  x: number,
  timelineStart: Date,
  scale: TimeScale,
  snapDays: number = 1
): Date {
  const pxPerDay = getPixelsPerDay(scale);
  let days = x / pxPerDay;
  if (snapDays > 1) {
    days = Math.round(days / snapDays) * snapDays;
  } else {
    days = Math.round(days);
  }
  return addDays(timelineStart, days);
}

/**
 * Builds time scale header intervals for rendering the Gantt timeline header bar.
 */
export function generateTimeHeaders(
  timelineStart: Date,
  timelineEnd: Date,
  scale: TimeScale
): { topHeaders: TimeHeaderCell[]; subHeaders: TimeHeaderCell[]; totalWidth: number } {
  const pxPerDay = getPixelsPerDay(scale);
  const totalDays = diffDays(timelineEnd, timelineStart);
  const totalWidth = Math.max(800, totalDays * pxPerDay);
  const today = normalizeDate(new Date())!;

  const topHeaders: TimeHeaderCell[] = [];
  const subHeaders: TimeHeaderCell[] = [];

  if (scale === "day") {
    // Top headers: Months
    // Sub headers: Individual Days
    let curMonth = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
    while (curMonth <= timelineEnd) {
      const nextMonth = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 1);
      const mStart = curMonth < timelineStart ? timelineStart : curMonth;
      const mEnd = nextMonth > timelineEnd ? timelineEnd : nextMonth;
      const daysInBlock = Math.max(1, diffDays(mEnd, mStart));
      const left = diffDays(mStart, timelineStart) * pxPerDay;
      const width = daysInBlock * pxPerDay;

      topHeaders.push({
        id: `m-${curMonth.toISOString()}`,
        label: curMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        startDate: mStart,
        endDate: mEnd,
        left,
        width,
      });
      curMonth = nextMonth;
    }

    // Sub headers for each day
    let curDay = new Date(timelineStart);
    while (curDay <= timelineEnd) {
      const left = diffDays(curDay, timelineStart) * pxPerDay;
      const isToday = diffDays(curDay, today) === 0;
      subHeaders.push({
        id: `d-${curDay.toISOString()}`,
        label: curDay.getDate().toString(),
        subLabel: curDay.toLocaleDateString("en-US", { weekday: "narrow" }),
        startDate: curDay,
        endDate: addDays(curDay, 1),
        left,
        width: pxPerDay,
        isToday,
      });
      curDay = addDays(curDay, 1);
    }
  } else if (scale === "week") {
    // Top headers: Months
    let curMonth = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
    while (curMonth <= timelineEnd) {
      const nextMonth = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 1);
      const mStart = curMonth < timelineStart ? timelineStart : curMonth;
      const mEnd = nextMonth > timelineEnd ? timelineEnd : nextMonth;
      const daysInBlock = Math.max(1, diffDays(mEnd, mStart));
      const left = diffDays(mStart, timelineStart) * pxPerDay;
      const width = daysInBlock * pxPerDay;

      topHeaders.push({
        id: `m-${curMonth.toISOString()}`,
        label: curMonth.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        startDate: mStart,
        endDate: mEnd,
        left,
        width,
      });
      curMonth = nextMonth;
    }

    // Sub headers: Weeks (every 7 days)
    let curWeek = new Date(timelineStart);
    while (curWeek <= timelineEnd) {
      const nextWeek = addDays(curWeek, 7);
      const left = diffDays(curWeek, timelineStart) * pxPerDay;
      const width = 7 * pxPerDay;
      const isToday = today >= curWeek && today < nextWeek;

      subHeaders.push({
        id: `w-${curWeek.toISOString()}`,
        label: `W${getWeekNumber(curWeek)}`,
        subLabel: curWeek.toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
        startDate: curWeek,
        endDate: nextWeek,
        left,
        width,
        isToday,
      });
      curWeek = nextWeek;
    }
  } else {
    // Month scale
    // Top headers: Years / Quarters
    let curYear = new Date(timelineStart.getFullYear(), 0, 1);
    while (curYear <= timelineEnd) {
      const nextYear = new Date(curYear.getFullYear() + 1, 0, 1);
      const yStart = curYear < timelineStart ? timelineStart : curYear;
      const yEnd = nextYear > timelineEnd ? timelineEnd : nextYear;
      const daysInBlock = Math.max(1, diffDays(yEnd, yStart));
      const left = diffDays(yStart, timelineStart) * pxPerDay;
      const width = daysInBlock * pxPerDay;

      topHeaders.push({
        id: `y-${curYear.getFullYear()}`,
        label: curYear.getFullYear().toString(),
        startDate: yStart,
        endDate: yEnd,
        left,
        width,
      });
      curYear = nextYear;
    }

    // Sub headers: Months
    let curMonth = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
    while (curMonth <= timelineEnd) {
      const nextMonth = new Date(curMonth.getFullYear(), curMonth.getMonth() + 1, 1);
      const left = diffDays(curMonth, timelineStart) * pxPerDay;
      const width = diffDays(nextMonth, curMonth) * pxPerDay;
      const isToday = today >= curMonth && today < nextMonth;

      subHeaders.push({
        id: `m-${curMonth.toISOString()}`,
        label: curMonth.toLocaleDateString("en-US", { month: "short" }),
        startDate: curMonth,
        endDate: nextMonth,
        left,
        width,
        isToday,
      });
      curMonth = nextMonth;
    }
  }

  return { topHeaders, subHeaders, totalWidth };
}

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ── 2. DAG & Cycle Detection ──────────────────────────────────────────────────

/**
 * Detects whether the milestone dependency graph contains a cycle.
 */
export function detectCycle(milestones: GanttMilestone[]): {
  hasCycle: boolean;
  cycleNodes: string[];
} {
  const adj = new Map<string, string[]>();
  for (const m of milestones) {
    adj.set(m.id, [...(m.dependsOn || [])]);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const cyclePath: string[] = [];

  function dfs(node: string, path: string[]): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adj.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, path)) return true;
      } else if (recStack.has(neighbor)) {
        path.push(neighbor);
        const cycleStartIndex = path.indexOf(neighbor);
        cyclePath.push(...path.slice(cycleStartIndex));
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  for (const m of milestones) {
    if (!visited.has(m.id)) {
      if (dfs(m.id, [])) {
        return { hasCycle: true, cycleNodes: cyclePath };
      }
    }
  }

  return { hasCycle: false, cycleNodes: [] };
}

/**
 * Checks if adding predecessorId to successorId's dependsOn array is valid without creating a cycle.
 */
export function canAddDependency(
  milestones: GanttMilestone[],
  predecessorId: string,
  successorId: string
): { allowed: boolean; reason?: string } {
  if (predecessorId === successorId) {
    return { allowed: false, reason: "A milestone cannot depend on itself." };
  }

  // Create simulated graph
  const simulated = milestones.map((m) => {
    if (m.id === successorId) {
      const existing = new Set(m.dependsOn || []);
      existing.add(predecessorId);
      return { ...m, dependsOn: Array.from(existing) };
    }
    return m;
  });

  const { hasCycle } = detectCycle(simulated);
  if (hasCycle) {
    return {
      allowed: false,
      reason: "Adding this dependency creates a circular dependency loop.",
    };
  }

  return { allowed: true };
}

// ── 3. Critical Path Method (CPM) ─────────────────────────────────────────────

/**
 * Computes the Critical Path (zero-slack bottleneck path) across all milestones.
 */
export function calculateCriticalPath(milestones: GanttMilestone[]): CriticalPathResult {
  const criticalMilestoneIds = new Set<string>();
  const criticalDependencyPairs = new Set<string>();
  const slackDaysMap = new Map<string, number>();

  if (milestones.length === 0) {
    return { criticalMilestoneIds, criticalDependencyPairs, slackDaysMap };
  }

  // Compute duration in days for each milestone
  const durationMap = new Map<string, number>();
  for (const m of milestones) {
    const s = normalizeDate(m.startDate);
    const t = normalizeDate(m.targetDate);
    if (s && t) {
      durationMap.set(m.id, Math.max(1, diffDays(t, s)));
    } else {
      durationMap.set(m.id, 7); // Default 7 days duration
    }
  }

  // Build Adjacency lists (Predecessors & Successors)
  // Note: m.dependsOn contains PREDECESSOR ids that must finish before m can start.
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  for (const m of milestones) {
    successors.set(m.id, []);
    predecessors.set(m.id, [...(m.dependsOn || [])]);
  }

  for (const m of milestones) {
    for (const predId of m.dependsOn || []) {
      if (successors.has(predId)) {
        successors.get(predId)!.push(m.id);
      }
    }
  }

  // Topological sorting via Kahn's algorithm
  const inDegree = new Map<string, number>();
  for (const m of milestones) {
    inDegree.set(m.id, (predecessors.get(m.id) || []).length);
  }

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const succ of successors.get(curr) || []) {
      inDegree.set(succ, inDegree.get(succ)! - 1);
      if (inDegree.get(succ) === 0) queue.push(succ);
    }
  }

  if (topoOrder.length < milestones.length) {
    // Cycle present — fallback
    return { criticalMilestoneIds, criticalDependencyPairs, slackDaysMap };
  }

  // Forward Pass: Early Start (ES) and Early Finish (EF)
  const ES = new Map<string, number>();
  const EF = new Map<string, number>();

  for (const id of topoOrder) {
    const preds = predecessors.get(id) || [];
    let maxPredEF = 0;
    for (const p of preds) {
      maxPredEF = Math.max(maxPredEF, EF.get(p) || 0);
    }
    const dur = durationMap.get(id) || 1;
    ES.set(id, maxPredEF);
    EF.set(id, maxPredEF + dur);
  }

  // Project Total Duration
  let projectDuration = 0;
  EF.forEach((ef) => {
    projectDuration = Math.max(projectDuration, ef);
  });

  // Backward Pass: Late Start (LS) and Late Finish (LF)
  const LS = new Map<string, number>();
  const LF = new Map<string, number>();

  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const succs = successors.get(id) || [];
    let minSuccLS = projectDuration;
    if (succs.length > 0) {
      minSuccLS = Math.min(...succs.map((s) => LS.get(s) ?? projectDuration));
    }
    const dur = durationMap.get(id) || 1;
    LF.set(id, minSuccLS);
    LS.set(id, minSuccLS - dur);
  }

  // Slack / Float Calculation ($Slack = LS - ES$)
  let minSlack = Infinity;
  for (const id of topoOrder) {
    const slack = (LS.get(id) ?? 0) - (ES.get(id) ?? 0);
    slackDaysMap.set(id, slack);
    minSlack = Math.min(minSlack, slack);
  }

  // Milestones with minimum slack form the critical path
  const threshold = Math.max(0, minSlack);
  for (const [id, slack] of slackDaysMap.entries()) {
    if (slack <= threshold) {
      criticalMilestoneIds.add(id);
    }
  }

  // Identify critical dependency pairs
  for (const succId of criticalMilestoneIds) {
    const preds = predecessors.get(succId) || [];
    for (const predId of preds) {
      if (criticalMilestoneIds.has(predId)) {
        criticalDependencyPairs.add(`${predId}->${succId}`);
      }
    }
  }

  return { criticalMilestoneIds, criticalDependencyPairs, slackDaysMap };
}

// ── 4. Cascade Auto-Scheduling Engine ─────────────────────────────────────────

/**
 * Calculates downstream date shifts when an upstream milestone's dates change.
 */
export function calculateCascadeShifts(
  milestones: GanttMilestone[],
  shiftedMilestoneId: string,
  newStartDate: Date,
  newTargetDate: Date
): CascadeShiftItem[] {
  const shifts: CascadeShiftItem[] = [];
  const milestoneMap = new Map<string, GanttMilestone>();
  const tempDates = new Map<string, { start: Date; target: Date }>();

  for (const m of milestones) {
    milestoneMap.set(m.id, m);
    const s = normalizeDate(m.startDate) || new Date();
    const t = normalizeDate(m.targetDate) || addDays(s, 7);
    tempDates.set(m.id, { start: s, target: t });
  }

  // Apply shift to target milestone
  tempDates.set(shiftedMilestoneId, { start: newStartDate, target: newTargetDate });

  // Map successors (milestones that depend on current node)
  const successors = new Map<string, string[]>();
  for (const m of milestones) {
    successors.set(m.id, []);
  }
  for (const m of milestones) {
    for (const predId of m.dependsOn || []) {
      if (successors.has(predId)) {
        successors.get(predId)!.push(m.id);
      }
    }
  }

  // BFS / Queue to propagate shifts downstream
  const queue: string[] = [shiftedMilestoneId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currDates = tempDates.get(currId)!;
    const directSuccs = successors.get(currId) || [];

    for (const succId of directSuccs) {
      const succNode = milestoneMap.get(succId);
      if (!succNode) continue;

      const succDates = tempDates.get(succId)!;
      const succDuration = Math.max(1, diffDays(succDates.target, succDates.start));

      // Constraint: Successor must start at least 1 day after Predecessor targetDate
      const minRequiredStart = addDays(currDates.target, 1);

      if (succDates.start < minRequiredStart) {
        // Shift needed!
        const shiftDays = diffDays(minRequiredStart, succDates.start);
        const updatedStart = new Date(minRequiredStart);
        const updatedTarget = addDays(updatedStart, succDuration);

        tempDates.set(succId, { start: updatedStart, target: updatedTarget });

        const originalNode = milestoneMap.get(succId)!;
        shifts.push({
          milestoneId: succId,
          title: originalNode.title,
          oldStartDate: normalizeDate(originalNode.startDate),
          oldTargetDate: normalizeDate(originalNode.targetDate),
          newStartDate: updatedStart,
          newTargetDate: updatedTarget,
          shiftDays,
        });

        if (!visited.has(succId)) {
          visited.add(succId);
          queue.push(succId);
        }
      }
    }
  }

  return shifts;
}

// ── 5. SVG Dependency Path Generator ──────────────────────────────────────────

/**
 * Computes an SVG curve path between predecessor target edge and successor start edge.
 */
export function generateConnectorPath(
  src: { x: number; y: number },
  tgt: { x: number; y: number }
): string {
  const dx = Math.abs(tgt.x - src.x);

  if (tgt.x >= src.x + 20) {
    // Normal forward flow: smooth cubic bezier
    const ctrlOffset = Math.max(30, dx * 0.4);
    return `M ${src.x} ${src.y} C ${src.x + ctrlOffset} ${src.y}, ${tgt.x - ctrlOffset} ${tgt.y}, ${tgt.x} ${tgt.y}`;
  } else {
    // Successor starts earlier than predecessor (backward wrap): multi-point orthogonal curve
    const midY = (src.y + tgt.y) / 2;
    const loopX = src.x + 25;
    const returnX = tgt.x - 25;
    return `M ${src.x} ${src.y} L ${loopX} ${src.y} C ${loopX + 15} ${src.y}, ${loopX + 15} ${midY}, ${loopX} ${midY} L ${returnX} ${midY} C ${returnX - 15} ${midY}, ${returnX - 15} ${tgt.y}, ${returnX} ${tgt.y} L ${tgt.x} ${tgt.y}`;
  }
}

// ── 6. Baseline vs. Actual Variance ───────────────────────────────────────────

export function calculateBaselineVariance(
  currentTargetInput: Date | string | null | undefined,
  baselineTargetInput: Date | string | null | undefined
): BaselineVarianceResult {
  const currentTarget = normalizeDate(currentTargetInput);
  const baselineTarget = normalizeDate(baselineTargetInput);

  if (!baselineTarget) {
    return { driftDays: 0, label: "No baseline", status: "no_baseline" };
  }

  if (!currentTarget) {
    return { driftDays: 0, label: "No target date", status: "no_baseline" };
  }

  const driftDays = diffDays(currentTarget, baselineTarget);

  if (driftDays === 0) {
    return { driftDays: 0, label: "On baseline", status: "on_track" };
  } else if (driftDays > 0) {
    return {
      driftDays,
      label: `+${driftDays}d delay`,
      status: "delayed",
    };
  } else {
    return {
      driftDays,
      label: `${driftDays}d ahead`,
      status: "ahead",
    };
  }
}
