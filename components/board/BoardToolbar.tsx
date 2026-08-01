"use client";

import { ZoomIn, ZoomOut, RotateCcw, Plus, Terminal, Target, Milestone, StickyNote, ChevronDown, X } from "lucide-react";
import type { GoalSimple, MilestoneWithTasks, BoardItemFull } from "@/types/board";
import { useState, useRef, useEffect } from "react";

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
}

export function BoardToolbar({
  zoom, onZoomIn, onZoomOut, onZoomReset, onCommandOpen,
  workspaceId, goals, milestones, onItemAdded,
}: BoardToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerType, setPickerType] = useState<"goal" | "milestone" | null>(null);
  const [adding, setAdding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    label?: string
  ) {
    setAdding(true);
    setMenuOpen(false);
    setPickerType(null);

    const body: Record<string, unknown> = {
      workspaceId,
      entityType,
      x: 120 + Math.random() * 300,
      y: 120 + Math.random() * 200,
      width: entityType === "note" ? 180 : 200,
      height: entityType === "note" ? 100 : 120,
    };
    if (entityType === "goal" && linkedId) body.linkedGoalId = linkedId;
    if (entityType === "milestone" && linkedId) body.linkedMilestoneId = linkedId;
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

  return (
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
          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[170px]">
            {/* Note */}
            <button
              onClick={() => createItem("note")}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
            >
              <StickyNote size={14} className="text-amber-500" />
              <span className="text-slate-700">Note card</span>
            </button>

            {/* Goal picker */}
            {goals.length > 0 && (
              <button
                onClick={() => setPickerType(pickerType === "goal" ? null : "goal")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
              >
                <Target size={14} className="text-blue-500" />
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

            {/* Milestone picker */}
            {milestones.length > 0 && (
              <button
                onClick={() => setPickerType(pickerType === "milestone" ? null : "milestone")}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2.5"
              >
                <Milestone size={14} className="text-violet-500" />
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
