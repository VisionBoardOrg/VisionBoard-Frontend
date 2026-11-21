"use client";

import {
  ZoomIn,
  ZoomOut,
  Plus,
  Target,
  Milestone,
  StickyNote,
  ChevronDown,
  X,
  Check,
  RefreshCw,
  LayoutGrid,
  Kanban,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { GoalSimple, MilestoneWithTasks, BoardItemFull } from "@/types/board";
import type { PresenceUser } from "@/store/cursor-store";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { NewGoalModal } from "@/components/goals/NewGoalModal";
import { useModalA11y } from "@/hooks/useModalA11y";
import { useBoardStore } from "@/store/board-store";
import { useToast } from "@/context/ToastContext";

// ── Layout constants for the Goal → Milestone → Task hierarchy ──────────────
const COL_GOAL_X = 80;
const COL_MILESTONE_X = 380;
const ROW_START_Y = 80;
const ROW_GAP = 150;

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
  workspaceId: string;
  goals: GoalSimple[];
  milestones: MilestoneWithTasks[];
  onItemAdded: (item: BoardItemFull) => void;
  /** Called when an optimistic card ID is reconciled with the persisted server card */
  onItemReconciled?: (tempId: string, realItem: BoardItemFull) => void;
  /** Optional viewport-aware spawn position resolver */
  getSpawnPosition?: (
    entityType: "goal" | "milestone" | "note",
    cardWidth: number,
    cardHeight: number
  ) => { x: number; y: number };
  onGoalCreated: (goal: GoalSimple) => void;
  onMilestoneCreated: (milestone: MilestoneWithTasks) => void;
  /** Current board items — used to compute auto-layout positions */
  currentItems: BoardItemFull[];
  /** Called with newly synced items after a sync */
  onItemsSynced: (items: BoardItemFull[]) => void;
  /** Active live remote collaborators on this canvas */
  activeCollaborators?: PresenceUser[];
  sendEvent?: (event: Record<string, unknown>) => void;
  /** Current active layout mode */
  layoutMode?: "canvas" | "kanban";
  /** Callback to open/toggle layout side panel */
  onToggleLayoutSidePanel?: () => void;
  /** Callback to open natural-language AI board edit command bar */
  onOpenAICommand?: () => void;
}

export function BoardToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  workspaceId,
  goals,
  milestones,
  onItemAdded,
  onItemReconciled,
  getSpawnPosition,
  onGoalCreated,
  onMilestoneCreated,
  currentItems,
  onItemsSynced,
  activeCollaborators = [],
  sendEvent,
  layoutMode = "canvas",
  onToggleLayoutSidePanel,
  onOpenAICommand,
}: BoardToolbarProps) {
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerType, setPickerType] = useState<"goal" | "milestone" | null>(null);
  const [adding, setAdding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);

  // Correctly distinguish goal cards from milestone cards that also carry linkedGoalId
  const coveredGoalIds = new Set(
    currentItems
      .filter((i) => i.entityType === "goal" && i.linkedGoalId)
      .map((i) => i.linkedGoalId!)
  );
  const coveredMilestoneIds = new Set(
    currentItems
      .filter((i) => i.entityType === "milestone" && i.linkedMilestoneId)
      .map((i) => i.linkedMilestoneId!)
  );
  const hasMissingCards =
    milestones.some((m) => !coveredMilestoneIds.has(m.id)) ||
    goals.some((g) => !coveredGoalIds.has(g.id));

  async function syncMissingCards() {
    setSyncing(true);
    try {
      const res = await fetch("/api/board-items/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({
          type: "error",
          title: "Sync failed",
          description: errData.error ?? "Could not sync missing cards to the board.",
        });
        return;
      }
      const data = await res.json();
      if (data.items?.length > 0) {
        onItemsSynced(data.items);
        if (sendEvent) {
          for (const item of data.items) {
            sendEvent({
              type: "CARD_CREATED",
              workspaceId,
              boardItem: item,
            });
          }
        }
        toast({
          type: "success",
          title: "Board synced",
          description: `Added ${data.items.length} missing card${data.items.length === 1 ? "" : "s"} to the board.`,
        });
      } else {
        toast({
          type: "info",
          title: "Already up to date",
          description: "All goals and milestones already have board cards.",
        });
      }
    } catch {
      toast({
        type: "error",
        title: "Network error",
        description: "Failed to sync missing cards. Please check your connection.",
      });
    } finally {
      setSyncing(false);
    }
  }

  // New goal modal state
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  // New milestone modal state
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [msTitle, setMsTitle] = useState("");
  const [msGoalId, setMsGoalId] = useState<string>("");
  const [msCreating, setMsCreating] = useState(false);
  const [msError, setMsError] = useState("");
  const msTitleRef = useRef<HTMLInputElement>(null);
  const msDialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(msDialogRef, () => setMsModalOpen(false), msModalOpen, {
    initialFocusRef: msTitleRef,
  });

  const effectiveGoalId = msGoalId || (goals.length === 1 ? goals[0].id : "");

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        menuPortalRef.current &&
        !menuPortalRef.current.contains(target)
      ) {
        setMenuOpen(false);
        setPickerType(null);
      }
    }
    function closeOnResize() {
      setMenuOpen(false);
      setPickerType(null);
    }
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        setPickerType(null);
      }
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", closeOnResize);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", closeOnResize);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  async function createItem(
    entityType: "goal" | "milestone" | "note",
    linkedId?: string,
    label?: string,
    explicitGoalId?: string
  ) {
    setAdding(true);
    setMenuOpen(false);
    setPickerType(null);

    const cardWidth = entityType === "note" ? 180 : 220;
    const cardHeight = entityType === "note" ? 100 : 130;

    let targetX: number;
    let targetY: number;

    if (getSpawnPosition) {
      const pos = getSpawnPosition(entityType, cardWidth, cardHeight);
      targetX = pos.x;
      targetY = pos.y;
    } else {
      targetX =
        entityType === "goal"
          ? COL_GOAL_X
          : entityType === "milestone"
          ? COL_MILESTONE_X
          : 120 + Math.random() * 300;
      targetY =
        entityType === "note"
          ? 120 + Math.random() * 200
          : nextColumnY(currentItems, targetX, cardHeight);
    }

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
      const goalId = explicitGoalId ?? milestones.find((m) => m.id === linkedId)?.goalId;
      if (goalId) body.linkedGoalId = goalId;
    }
    if (entityType === "note") body.label = label ?? "New note";

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const linkedGoal =
      entityType === "goal" && linkedId ? (goals.find((g) => g.id === linkedId) ?? null) : null;
    const linkedMilestone =
      entityType === "milestone" && linkedId
        ? (milestones.find((m) => m.id === linkedId) ?? null)
        : null;

    const optimisticItem: BoardItemFull = {
      id: tempId,
      workspaceId,
      x: targetX,
      y: targetY,
      width: cardWidth,
      height: cardHeight,
      entityType,
      color: null,
      label: entityType === "note" ? (label ?? "New note") : null,
      linkedGoalId:
        entityType === "goal"
          ? (linkedId ?? null)
          : entityType === "milestone"
          ? (explicitGoalId ?? linkedMilestone?.goalId ?? null)
          : null,
      linkedMilestoneId: entityType === "milestone" ? (linkedId ?? null) : null,
      linkedTaskId: null,
      linkedGoal,
      linkedMilestone,
    };

    onItemAdded(optimisticItem);

    try {
      const res = await fetch(`/api/board-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        // Hydrate full linked goal/milestone data so nothing is stripped
        const reconciledItem: BoardItemFull = {
          ...data.boardItem,
          linkedGoal: linkedGoal ?? data.boardItem.linkedGoal ?? null,
          linkedMilestone: linkedMilestone ?? data.boardItem.linkedMilestone ?? null,
        };
        useBoardStore.getState().replaceItemId(tempId, reconciledItem);
        onItemReconciled?.(tempId, reconciledItem);
        if (sendEvent) {
          sendEvent({
            type: "CARD_CREATED",
            workspaceId,
            boardItem: reconciledItem,
          });
        }
      } else {
        useBoardStore.getState().removeItem(tempId);
        toast({
          title: "Failed to create card",
          description: "Could not save card to the server. Please try again.",
          type: "error",
        });
      }
    } catch {
      useBoardStore.getState().removeItem(tempId);
      toast({
        title: "Connection error",
        description: "Failed to save card. Please check your network.",
        type: "error",
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleCreateMilestone(e: React.FormEvent) {
    e.preventDefault();
    const title = msTitle.trim();
    if (!title) {
      setMsError("Title is required.");
      return;
    }
    if (!effectiveGoalId) {
      setMsError("Please select a goal for this milestone.");
      return;
    }

    setMsCreating(true);
    setMsError("");
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, goalId: effectiveGoalId, title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsError(data.error ?? "Failed to create milestone.");
        return;
      }
      const data = await res.json();
      const newMilestone: MilestoneWithTasks = data.milestone;
      onMilestoneCreated(newMilestone);
      await createItem("milestone", newMilestone.id, undefined, newMilestone.goalId);
      setMsModalOpen(false);
      setMsTitle("");
      setMsGoalId("");
    } catch {
      setMsError("Network error. Please try again.");
    } finally {
      setMsCreating(false);
    }
  }

  return (
    <>
      {/* Bottom floating toolbar — spans the canvas, stays fixed during pan/zoom */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white border border-border rounded-xl shadow-sm px-2 py-1.5 max-w-[calc(100%-1.5rem)] overflow-x-auto no-scrollbar">
        {/* Zoom controls — Canvas mode only */}
        {layoutMode === "canvas" && (
          <>
            <ToolbarButton onClick={onZoomOut} title="Zoom out (-)">
              <ZoomOut size={15} aria-hidden="true" />
            </ToolbarButton>

            <button
              type="button"
              onClick={onZoomReset}
              className="px-2.5 py-1 text-xs font-mono text-slate hover:text-ink hover:bg-offwhite rounded-lg transition-colors cursor-pointer"
              title="Reset zoom and pan (0)"
              aria-label={`Zoom ${Math.round(zoom * 100)} percent, click to reset`}
            >
              {Math.round(zoom * 100)}%
            </button>

            <ToolbarButton onClick={onZoomIn} title="Zoom in (+)">
              <ZoomIn size={15} aria-hidden="true" />
            </ToolbarButton>

            <div className="w-px h-5 bg-border mx-1 shrink-0" />
          </>
        )}

        {/* Add item — drop-down menu (portaled above trigger) */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              if (menuOpen) {
                setMenuOpen(false);
              } else {
                const rect = menuRef.current?.getBoundingClientRect();
                if (rect) {
                  setMenuPos({
                    left: Math.max(8, Math.min(rect.left, window.innerWidth - 220)),
                    bottom: window.innerHeight - rect.top + 6,
                  });
                }
                setMenuOpen(true);
              }
              setPickerType(null);
            }}
            disabled={adding}
            title={layoutMode === "kanban" ? "Add milestone" : "Add card"}
            aria-label={layoutMode === "kanban" ? "Add milestone" : "Add card"}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-1 p-1.5 text-slate hover:text-ink hover:bg-offwhite rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Plus size={15} aria-hidden="true" />
            <ChevronDown
              size={11}
              aria-hidden="true"
              className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {menuOpen &&
          menuPos &&
          createPortal(
            <div
              ref={menuPortalRef}
              role="menu"
              aria-label={layoutMode === "kanban" ? "Add milestone" : "Add card"}
              className="fixed z-[60] bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[205px]"
              style={{ left: menuPos.left, bottom: menuPos.bottom }}
            >
              {/* Note — Canvas mode only */}
              {layoutMode === "canvas" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => createItem("note")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <StickyNote size={14} className="text-amber-500" aria-hidden="true" />
                  <span className="text-slate-700">Note card</span>
                </button>
              )}

              {/* Goals — Canvas mode only */}
              {layoutMode === "canvas" && (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setGoalModalOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Target size={14} className="text-blue-500" aria-hidden="true" />
                    <span className="text-slate-700">New goal…</span>
                  </button>

                  {goals.length > 0 && (
                    <button
                      type="button"
                      role="menuitem"
                      aria-expanded={pickerType === "goal"}
                      onClick={() => setPickerType(pickerType === "goal" ? null : "goal")}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                    >
                      <Target size={14} className="text-blue-300" aria-hidden="true" />
                      <span className="text-slate-700 flex-1">Goal card</span>
                      <ChevronDown
                        size={11}
                        aria-hidden="true"
                        className={`text-slate-400 transition-transform ${pickerType === "goal" ? "rotate-180" : ""}`}
                      />
                    </button>
                  )}

                  {pickerType === "goal" && (
                    <div className="bg-slate-50 border-t border-slate-100 max-h-48 overflow-y-auto">
                      {goals.map((g) => {
                        const onBoard = coveredGoalIds.has(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            role="menuitem"
                            disabled={onBoard}
                            onClick={() => createItem("goal", g.id)}
                            className="w-full text-left px-4 py-2 text-xs hover:bg-white transition-colors disabled:opacity-55 disabled:cursor-not-allowed flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <span className="font-medium text-slate-700 block truncate">{g.title}</span>
                              <span className="block text-[10px] text-slate-400 mt-0.5">{g.status}</span>
                            </div>
                            {onBoard && (
                              <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                On board
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* New milestone (available in both Canvas and Kanban) */}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setMsModalOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
              >
                <Milestone size={14} className="text-violet-500" aria-hidden="true" />
                <span className="text-slate-700">New milestone…</span>
              </button>

              {/* Milestone card picker (link to existing milestone) */}
              {milestones.length > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  aria-expanded={pickerType === "milestone"}
                  onClick={() => setPickerType(pickerType === "milestone" ? null : "milestone")}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <Milestone size={14} className="text-violet-300" aria-hidden="true" />
                  <span className="text-slate-700 flex-1">Milestone card</span>
                  <ChevronDown
                    size={11}
                    aria-hidden="true"
                    className={`text-slate-400 transition-transform ${pickerType === "milestone" ? "rotate-180" : ""}`}
                  />
                </button>
              )}

              {pickerType === "milestone" && (
                <div className="bg-slate-50 border-t border-slate-100 max-h-48 overflow-y-auto">
                  {milestones.map((m) => {
                    const mTasks = m.tasks ?? [];
                    const onBoard = coveredMilestoneIds.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="menuitem"
                        disabled={onBoard}
                        onClick={() => createItem("milestone", m.id)}
                        className="w-full text-left px-4 py-2 text-xs hover:bg-white transition-colors disabled:opacity-55 disabled:cursor-not-allowed flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-700 block truncate">{m.title}</span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">
                            {mTasks.filter((t) => t.status === "done").length}/{mTasks.length} tasks done
                          </span>
                        </div>
                        {onBoard && (
                          <span className="shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            On board
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>,
            document.body
          )}

        <div className="w-px h-5 bg-border mx-1 shrink-0" />

        {/* Layout side panel switcher */}
        <button
          type="button"
          onClick={onToggleLayoutSidePanel}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors border border-slate-200/80 shadow-2xs shrink-0 cursor-pointer"
          title="Switch Board Layouts"
          aria-label={`Current layout: ${layoutMode}. Click to switch board layouts.`}
        >
          {layoutMode === "kanban" ? (
            <Kanban size={14} className="text-purple-600" aria-hidden="true" />
          ) : (
            <LayoutGrid size={14} className="text-indigo-600" aria-hidden="true" />
          )}
          <span>{layoutMode === "kanban" ? "Kanban" : "Canvas"}</span>
          <SlidersHorizontal size={12} className="text-slate-400 ml-0.5" aria-hidden="true" />
        </button>

        {/* AI Board Edit trigger */}
        {onOpenAICommand && (
          <>
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
            <button
              type="button"
              onClick={onOpenAICommand}
              title="Edit the board with natural language"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue bg-blue-faint hover:bg-blue-light/50 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <Sparkles size={13} aria-hidden="true" />
              <span>AI Edit</span>
            </button>
          </>
        )}

        {/* Sync missing cards */}
        {hasMissingCards && (
          <>
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
            <button
              type="button"
              onClick={syncMissingCards}
              disabled={syncing}
              title="Add board cards for any goals or milestones that are missing one"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <RefreshCw size={13} className={syncing ? "animate-spin" : ""} aria-hidden="true" />
              <span>{syncing ? "Syncing…" : "Sync missing cards"}</span>
            </button>
          </>
        )}

        {/* Live Collaborators Stack */}
        {activeCollaborators.length > 0 && (
          <>
            <div className="w-px h-5 bg-border mx-1 shrink-0" />
            <div className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg bg-blue-faint/60 border border-blue-light/50 shrink-0">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <div className="flex items-center -space-x-1.5">
                {activeCollaborators.slice(0, 4).map((c) => (
                  <div
                    key={c.userId}
                    className="relative group"
                    title={`${c.userName} is online`}
                  >
                    {c.userImage ? (
                      <Image
                        src={c.userImage}
                        alt={c.userName}
                        width={20}
                        height={20}
                        unoptimized
                        className="w-5 h-5 rounded-full object-cover border border-white shadow-xs"
                        style={{ borderColor: c.userColor }}
                      />
                    ) : (
                      <span
                        className="w-5 h-5 rounded-full text-[9px] font-bold text-white flex items-center justify-center border border-white shadow-xs uppercase"
                        style={{ backgroundColor: c.userColor }}
                      >
                        {c.userName.charAt(0)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-[11px] font-semibold text-blue-deep pr-0.5">
                {activeCollaborators.length} online
              </span>
            </div>
          </>
        )}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setMsModalOpen(false)}
        >
          <div
            ref={msDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-milestone-modal-title"
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2
                id="new-milestone-modal-title"
                className="text-base font-bold text-slate-800 flex items-center gap-2"
              >
                <Milestone size={16} className="text-violet-500" aria-hidden="true" />
                New Milestone
              </h2>
              <button
                type="button"
                onClick={() => setMsModalOpen(false)}
                aria-label="Close dialog"
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateMilestone} className="space-y-4">
              <div>
                <label
                  htmlFor="new-milestone-title"
                  className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                  Milestone Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="new-milestone-title"
                  ref={msTitleRef}
                  type="text"
                  value={msTitle}
                  onChange={(e) => setMsTitle(e.target.value)}
                  placeholder="e.g. Complete user auth flow"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                />
              </div>

              <div>
                <label
                  htmlFor="new-milestone-goal"
                  className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                  Goal <span className="text-red-400">*</span>
                </label>
                {goals.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 px-3 py-2 rounded-lg">
                    No goals yet — create a goal first.
                  </p>
                ) : (
                  <select
                    id="new-milestone-goal"
                    value={effectiveGoalId}
                    onChange={(e) => setMsGoalId(e.target.value)}
                    className="w-full text-xs rounded-lg border border-border px-2.5 py-1.5 bg-white text-ink focus:outline-none focus:border-violet-500"
                  >
                    <option value="">Select a goal…</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {msError && (
                <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg" role="alert">
                  {msError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMsModalOpen(false);
                    setMsTitle("");
                    setMsGoalId("");
                    setMsError("");
                  }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={msCreating || !msTitle.trim() || !effectiveGoalId}
                  className="px-4 py-2 text-sm font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  {msCreating ? (
                    <span className="animate-pulse">Creating…</span>
                  ) : (
                    <>
                      <Check size={14} aria-hidden="true" /> Create Milestone
                    </>
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
  onClick,
  title,
  disabled = false,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="p-1.5 text-slate hover:text-ink hover:bg-offwhite rounded-lg transition-colors disabled:opacity-50 cursor-pointer shrink-0"
    >
      {children}
    </button>
  );
}
