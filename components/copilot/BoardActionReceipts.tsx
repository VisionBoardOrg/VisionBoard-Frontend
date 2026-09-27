"use client";

import React, { useState } from "react";
import {
  Trash2,
  UserCheck,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  RotateCcw,
  Loader2,
  Zap,
  Check,
  AlertCircle,
  Flag,
} from "lucide-react";
import type { ExecutedBoardAction } from "@/lib/ai/board-action-executor";

interface BoardActionReceiptsProps {
  actions: ExecutedBoardAction[];
  workspaceId: string;
  onUndoSuccess?: (action: ExecutedBoardAction) => void;
}

export function BoardActionReceipts({
  actions,
  workspaceId,
  onUndoSuccess,
}: BoardActionReceiptsProps) {
  const [undoingIds, setUndoingIds] = useState<Record<string, boolean>>({});
  const [undoneIds, setUndoneIds] = useState<Record<string, boolean>>({});
  const [errorIds, setErrorIds] = useState<Record<string, string>>({});

  if (!actions || actions.length === 0) return null;

  async function handleUndo(action: ExecutedBoardAction) {
    if (undoingIds[action.id] || undoneIds[action.id]) return;

    setUndoingIds((prev) => ({ ...prev, [action.id]: true }));
    setErrorIds((prev) => {
      const next = { ...prev };
      delete next[action.id];
      return next;
    });

    try {
      const res = await fetch("/api/ai/copilot/actions/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          action,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorIds((prev) => ({ ...prev, [action.id]: data.error || "Failed to undo action." }));
      } else {
        setUndoneIds((prev) => ({ ...prev, [action.id]: true }));
        onUndoSuccess?.(action);
      }
    } catch {
      setErrorIds((prev) => ({ ...prev, [action.id]: "Network error trying to undo." }));
    } finally {
      setUndoingIds((prev) => ({ ...prev, [action.id]: false }));
    }
  }

  function getActionIcon(actionType: string) {
    switch (actionType) {
      case "delete_milestone":
      case "delete_task":
      case "delete_goal":
        return <Trash2 size={13} className="text-rose-500" />;
      case "assign_task":
        return <UserCheck size={13} className="text-blue-500" />;
      case "update_task":
      case "update_milestone":
        return <RefreshCw size={13} className="text-amber-500" />;
      case "create_task":
      case "create_milestone":
        return <PlusCircle size={13} className="text-emerald-500" />;
      default:
        return <Zap size={13} className="text-indigo-500" />;
    }
  }

  return (
    <div className="mt-2.5 rounded-xl border border-indigo-100 bg-linear-to-b from-indigo-50/60 to-white/90 p-2.5 shadow-xs">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-indigo-100/60">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
            <Zap size={12} />
          </div>
          <span className="text-[11px] font-semibold text-slate-800 tracking-tight">
            Board Actions Applied ({actions.length})
          </span>
        </div>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={10} />
          Live Synced
        </span>
      </div>

      <div className="space-y-1.5">
        {actions.map((act) => {
          const isUndone = undoneIds[act.id];
          const isUndoing = undoingIds[act.id];
          const errorMsg = errorIds[act.id];

          return (
            <div
              key={act.id}
              className={`flex items-center justify-between gap-2 p-1.5 rounded-lg border text-[11px] transition-all ${
                isUndone
                  ? "bg-slate-50/80 border-slate-200 text-slate-400 line-through"
                  : act.success
                  ? "bg-white border-slate-200/80 text-slate-700 hover:border-indigo-200"
                  : "bg-red-50/80 border-red-200 text-red-700"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="shrink-0">{getActionIcon(act.action)}</div>
                <div className="truncate">
                  <span className="font-medium text-slate-800">
                    {act.message}
                  </span>
                  {errorMsg && (
                    <div className="text-[10px] text-red-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle size={10} />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                </div>
              </div>

              {act.canUndo && !isUndone && (
                <button
                  type="button"
                  onClick={() => handleUndo(act)}
                  disabled={isUndoing}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded transition-colors disabled:opacity-50 cursor-pointer"
                  title="Undo this action on the board"
                >
                  {isUndoing ? (
                    <>
                      <Loader2 size={10} className="animate-spin text-slate-500" />
                      <span>Undoing…</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw size={10} />
                      <span>Undo</span>
                    </>
                  )}
                </button>
              )}

              {isUndone && (
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-slate-400 font-medium no-underline">
                  <Check size={10} />
                  Reverted
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
