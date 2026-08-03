"use client";

import { ZoomIn, ZoomOut, RotateCcw, Plus, Terminal, Target, Milestone, StickyNote, ChevronDown, X } from "lucide-react";
import type { GoalSimple, MilestoneWithTasks, BoardItemFull } from "@/types/board";
import { useState, useRef, useEffect } from "react";
import { NewGoalModal } from "@/components/goals/NewGoalModal";

// ── Layout constants for the Goal → Milestone → Task hierarchy ──────────────
const COL_GOAL_X      = 80;
const COL_MILESTONE_X = 380;
const ROW_START_Y     = 80;
const ROW_GAP         = 150; // vertical spacing between sibling cards

/**
 * Compute the next available Y position in a column so cards don't overlap.
 * Looks at all existing items whose x is within ±20px of the target column x.
 */
function nextColumnY(
  existingItems: BoardItemFull[],
  targetX: number,
  cardHeight = 120
): number {
  const colItems = existingItems.filter((i) => Math.abs(i.x - targetX) < 20);
  if (colItems.length === 0) return ROW_START_Y;
  const maxBottom = Math.max(...colItems.map((i) => i.y + (i.height ?? cardHeight)));
  return maxBottom + ROW_GAP - cardHeight;
}

interface BoardToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onCommandOpen: () => void;
  workspaceId: string;
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  onItemAdded: (item: BoardItemFull) => void;
  onGoalCreated: (goal: GoalSimple) => void;
  onMilestoneCreated: (milestone: MilestoneWithTasks) => void;
  /** Current board items — used to compute auto-layout positions */
  currentItems: BoardItemFull[];
}

export function BoardToolbar({
  zoom, onZoomIn, onZoomOut, onZoomReset, onCommandOpen,
  workspaceId, goals, milestones, onItemAdded, onGoalCreated, onMilestoneCreated, currentItems,
}: BoardToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerType, setPickerType] = useState<"goal" | "milestone" | null>(null);
  const [adding, setAdding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // New goal modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // New milestone modal state
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msGoalId, setMsGoalId] = useState<string>("");
  const [msCreating, setMsCreating] = useState(false);
  const [msError, setMsError] = useState("");
  const msTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (msModalOpen) {
      // Pre-select first goal if only one exists
      if (goals.length === 1) setMsGoalId(goals[0].id);
      setTimeout(() => msTitleRef.current?.focus(), 50);
    }
  }, [msModalOpen, goals]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setPickerType(null);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function createItem(
    entityType: "goal" | "milestone" | "note",
    linkedId?: string,
    label?: string,
    explicitGoalId?: string   // used when creating a milestone card before state has updated
  ) {
    setAdding(true);
    setMenuOpen(false);
    setPickerType(null);

    let targetX: number;
    let cardWidth: number;
    let cardHeight: number;

    if (entityType === "goal") {
      targetX = COL_GOAL_X;
      cardWidth = 220;
      cardHeight = 130;
    } else if (entityType === "milestone") {
      targetX = COL_MILESTONE_X;
      cardWidth = 220;
      cardHeight = 130;
    } else {
      targetX = 120 + Math.random() * 300;
      cardWidth = 180;
      cardHeight = 100;
    }

    const targetY = entityType === "note"
      ? 120 + Math.random() * 200
      : nextColumnY(currentItems, targetX, cardHeight);

    const body: Record<string, unknown> = {
      workspaceId,
      entityType,
      x: targetX,
      y: targetY,
      width: cardWidth,
      height: cardHeight,
    };
    if (entityType === "goal" && linkedId) body.linkedGoalId = linkedId;
    if (entityType === "milestone" && linkedId) {
      body.linkedMilestoneId = linkedId;
      // Use explicit goalId first (avoids stale closure when milestone was just created),
      // then fall back to looking it up in the milestones list
      const goalId = explicitGoalId ?? milestones.find((m) => m.id === linkedId)?.goalId;
      if (goalId) body.linkedGoalId = goalId;
    }
    if (entityType === "note") body.label = label ?? "New note";

    const res = await fetch(`/api/board-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      onItemAdded(data.boardItem);
    }
    setAdding(false);
  }

  async function handleCreateMilestone(e: React.FormEvent) {
    e.preventDefault();
    const title = msTitle.trim();
    if (!title) { setMsError("Title is required."); return; }
    if (!msGoalId) { setMsError("Please select a goal for this milestone."); return; }

    setMsCreating(true);
    setMsError("");
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, goalId: msGoalId, title }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsError(data.error ?? "Failed to create milestone.");
        return;
      }
      const data = await res.json();
      const newMilestone: MilestoneWithTasks = data.milestone;
      onMilestoneCreated(newMilestone);
      // Pass goalId explicitly so createItem doesn't rely on stale milestones state
      await createItem("milestone", newMilestone.id, undefined, newMilestone.goalId);
      setMsModalOpen(false);
      setMsTitle("");
      setMsGoalId("");
    } finally {
      setMsCreating(false);
    }
  }

  return (
    <>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white border border-border rounded-xl shadow-sm px-2 py-1.5">
        {/* Zoom controls */}
        <ToolbarButton onClick={onZoomOut} title="Zoom out (-)"><ZoomOut size={15} /></ToolbarButton>

        <button
          onClick={onZoomReset}
          className="px-2.5 py-1 text-xs font-mono text-slate hover:text-ink hover:bg-offwhite rounded-lg transition-colors"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>

        <ToolbarButton onClick={onZoomIn} title="Zoom in (+)"><ZoomIn size={15} /></ToolbarButton>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Add item — drop-down menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => { setMenuOpen(!menuOpen); setPickerType(null); }}
            disabled={adding}
            title="Add card"
            className="flex items-center gap-1 p-1.5 text-slate hover:text-ink hover:bg-offwhite rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus size={15} />
            <ChevronDown size={11} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[180px]">
              {/* Note */}
              <button
                onClick={() => createItem("note")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
              >
                <StickyNote size={14} className="text-amber-500" />
                <span className="text-slate-700">Note card</span>
              </button>

              {/* New goal (always available) */}
              <button
                onClick={() => { setMenuOpen(false); setGoalModalOpen(true); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
              >
                <Target size={14} className="text-blue-500" />
                <span className="text-slate-700">New goal…</span>
              </button>

              {/* Goal card picker (link to existing goal) */}
              {goals.length > 0 && (
                <button
                  onClick={() => setPickerType(pickerType === "goal" ? null : "goal")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Target size={14} className="text-blue-300" />
                  <span className="text-slate-700 flex-1">Goal card</span>
                  <ChevronDown size={11} className={`text-slate-400 transition-transform ${pickerType === "goal" ? "rotate-180" : ""}`} />
                </button>
              )}

              {pickerType === "goal" && (
                <div className="bg-slate-50 border-t border-slate-100 max-h-48 overflow-y-auto">
                  {goals.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => createItem("goal", g.id)}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-white transition-colors"
                    >
                      <span className="font-medium text-slate-700">{g.title}</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">{g.status}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* New milestone (always available) */}
              <button
                onClick={() => { setMenuOpen(false); setMsModalOpen(true); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
              >
                <Milestone size={14} className="text-violet-500" />
                <span className="text-slate-700">New milestone…</span>
              </button>

              {/* Milestone card picker (link to existing milestone) */}
              {milestones.length > 0 && (
                <button
                  onClick={() => setPickerType(pickerType === "milestone" ? null : "milestone")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Milestone size={14} className="text-violet-300" />
                  <span className="text-slate-700 flex-1">Milestone card</span>
                  <ChevronDown size={11} className={`text-slate-400 transition-transform ${pickerType === "milestone" ? "rotate-180" : ""}`} />
                </button>
              )}

              {pickerType === "milestone" && (
                <div className="bg-slate-50 border-t border-slate-100 max-h-48 overflow-y-auto">
                  {milestones.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => createItem("milestone", m.id)}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-white transition-colors"
                    >
                      <span className="font-medium text-slate-700">{m.title}</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        {m.tasks.filter((t) => t.status === "done").length}/{m.tasks.length} tasks done
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* AI command bar */}
        <button
          onClick={onCommandOpen}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue hover:bg-blue-faint rounded-lg transition-colors"
          title="Open AI command bar (⌘K)"
        >
          <Terminal size={13} />
          <span>AI Edit</span>
          <kbd className="text-[10px] text-muted bg-offwhite border border-border rounded px-1 font-mono">⌘K</kbd>
        </button>
      </div>

      {/* New Goal modal */}
      {goalModalOpen && (
        <NewGoalModal
          workspaceId={workspaceId}
          extended
          onClose={() => setGoalModalOpen(false)}
          onCreated={async (newGoal) => {
            onGoalCreated(newGoal as GoalSimple);
            await createItem("goal", newGoal.id);
          }}
        />
      )}
      {/* New Milestone modal */}
      {msModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setMsModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Milestone size={16} className="text-violet-500" />
                New Milestone
              </h2>
              <button onClick={() => setMsModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateMilestone} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Milestone Title <span className="text-red-400">*</span>
                </label>
                <input
                  ref={msTitleRef}
                  type="text"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  placeholder="e.g. Complete user auth flow"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Goal <span className="text-red-400">*</span>
                </label>
                {goals.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">
                    No goals yet — create a goal first.
                  </p>
                ) : (
                  <select
                    value={msGoalId}
                    onChange={(e) => setMsGoalId(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent bg-white"
                  >
                    <option value="">Select a goal…</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                )}
              </div>

              {msError && (
                <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{msError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setMsModalOpen(false); setMsTitle(""); setMsGoalId(""); setMsError(""); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={msCreating || !msTitle.trim() || !msGoalId}
                  className="px-4 py-2 text-sm font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {msCreating ? (
                    <span className="animate-pulse">Creating…</span>
                  ) : (
                    <><Check size={14} /> Create Milestone</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ToolbarButton({
  onClick, title, disabled = false, children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 text-slate hover:text-ink hover:bg-offwhite rounded-lg transition-colors disabled:opacity-50"
    >
      {children}
    </button>
  );
}
