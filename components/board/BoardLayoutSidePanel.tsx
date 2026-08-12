"use client";

import { X, Check, LayoutGrid, Kanban, Layers, ArrowRight, Settings2 } from "lucide-react";

export type BoardLayoutMode = "canvas" | "kanban";

interface BoardLayoutSidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentLayout: BoardLayoutMode;
  onSelectLayout: (layout: BoardLayoutMode) => void;
  columnCount?: number;
  totalItemsCount?: number;
}

export function BoardLayoutSidePanel({
  isOpen,
  onClose,
  currentLayout,
  onSelectLayout,
  columnCount = 3,
  totalItemsCount = 0,
}: BoardLayoutSidePanelProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay for mobile / focus */}
      <div
        className="fixed inset-0 bg-slate-900/20 backdrop-blur-xs z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Side Panel Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 w-80 sm:w-96 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out"
        role="dialog"
        aria-label="Board Layout Switcher"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Board Layouts</h2>
              <p className="text-xs text-slate-500">Switch workspace views & columns</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 block">
              Select Active Layout
            </label>
            <div className="space-y-4">
              {/* Option 1: Spatial Canvas View */}
              <div
                onClick={() => onSelectLayout("canvas")}
                className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  currentLayout === "canvas"
                    ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                    : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-lg ${
                        currentLayout === "canvas"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                      }`}
                    >
                      <LayoutGrid size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">Spatial Canvas</h3>
                        {currentLayout === "canvas" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Freeform 2D interactive canvas with connected goals, milestones & zoom
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview Graphic - Canvas */}
                <div className="mt-3.5 p-3 bg-white rounded-lg border border-slate-200/80 relative h-20 overflow-hidden">
                  <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px]" />
                  <div className="absolute left-3 top-3 w-14 h-8 bg-blue-500/20 border border-blue-500 rounded text-[8px] p-1 font-mono text-blue-700 font-medium">
                    Goal #1
                  </div>
                  <div className="absolute left-24 top-7 w-16 h-8 bg-purple-500/20 border border-purple-500 rounded text-[8px] p-1 font-mono text-purple-700 font-medium">
                    Milestone
                  </div>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <path
                      d="M 68 28 C 80 28, 85 44, 96 44"
                      stroke="#8b5cf6"
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                      fill="none"
                    />
                  </svg>
                </div>
              </div>

              {/* Option 2: Status Kanban Columns View */}
              <div
                onClick={() => onSelectLayout("kanban")}
                className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  currentLayout === "kanban"
                    ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                    : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-lg ${
                        currentLayout === "kanban"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-600"
                      }`}
                    >
                      <Kanban size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">Status Columns</h3>
                        {currentLayout === "kanban" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white uppercase tracking-wider">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Structured status columns (To Do, In Progress, Complete) with drag-and-drop
                      </p>
                    </div>
                  </div>
                </div>

                {/* Preview Graphic - Kanban Columns matching user image design */}
                <div className="mt-3.5 p-2 bg-slate-50 rounded-lg border border-slate-200 flex gap-2 h-20 overflow-hidden">
                  <div className="flex-1 bg-slate-200/60 rounded-md p-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold bg-slate-300 px-1 py-0.5 rounded text-slate-700">
                        TO DO
                      </span>
                      <span className="text-[8px] text-slate-500">0</span>
                    </div>
                    <span className="text-[7px] text-slate-400 font-medium">+ Task</span>
                  </div>
                  <div className="flex-1 bg-purple-100/50 rounded-md p-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold bg-purple-600 px-1 py-0.5 rounded text-white">
                        IN PROGRESS
                      </span>
                      <span className="text-[8px] text-purple-700">0</span>
                    </div>
                    <span className="text-[7px] text-purple-600 font-medium">+ Task</span>
                  </div>
                  <div className="flex-1 bg-emerald-100/50 rounded-md p-1 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold bg-emerald-600 px-1 py-0.5 rounded text-white">
                        COMPLETE
                      </span>
                      <span className="text-[8px] text-emerald-700">0</span>
                    </div>
                    <span className="text-[7px] text-emerald-600 font-medium">+ Task</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Layout Summary / Options */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Settings2 size={14} className="text-slate-400" />
                Active Columns
              </span>
              <span className="font-semibold text-slate-900">{columnCount} Groups</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1.5">
                <Layers size={14} className="text-slate-400" />
                Total Board Items
              </span>
              <span className="font-semibold text-slate-900">{totalItemsCount} Cards</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            Apply Layout <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
