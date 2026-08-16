"use client";

import { AlertTriangle, ArrowRight, X, Zap } from "lucide-react";
import { CascadeShiftItem } from "@/lib/gantt-engine";

interface CascadePromptModalProps {
  isOpen: boolean;
  shiftedMilestoneTitle: string;
  shifts: CascadeShiftItem[];
  isSubmitting: boolean;
  onApplyCascade: () => void;
  onApplySingleOnly: () => void;
  onCancel: () => void;
}

export function CascadePromptModal({
  isOpen,
  shiftedMilestoneTitle,
  shifts,
  isSubmitting,
  onApplyCascade,
  onApplySingleOnly,
  onCancel,
}: CascadePromptModalProps) {
  if (!isOpen || shifts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-ink text-base">Schedule Cascade Detected</h3>
            <p className="text-xs text-slate mt-0.5">
              Shifting <span className="font-semibold text-ink">&ldquo;{shiftedMilestoneTitle}&rdquo;</span> impacts{" "}
              <span className="font-semibold text-amber-600">
                {shifts.length} dependent milestone{shifts.length > 1 ? "s" : ""}
              </span>
              .
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-muted hover:text-ink p-1 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Affected Shifts List */}
        <div className="bg-slate-50 border border-border/80 rounded-xl p-3 max-h-56 overflow-y-auto space-y-2">
          <div className="text-[11px] font-semibold text-slate uppercase tracking-wider px-1">
            Downstream Adjustments Required:
          </div>
          {shifts.map((item) => (
            <div
              key={item.milestoneId}
              className="bg-white rounded-lg border border-border p-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink truncate">{item.title}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                  <span>
                    {item.oldStartDate ? item.oldStartDate.toLocaleDateString() : "No start"} –{" "}
                    {item.oldTargetDate ? item.oldTargetDate.toLocaleDateString() : "No target"}
                  </span>
                  <ArrowRight size={12} className="text-slate shrink-0" />
                  <span className="font-semibold text-blue">
                    {item.newStartDate.toLocaleDateString()} – {item.newTargetDate.toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="shrink-0 bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full text-[10px] border border-amber-200">
                +{item.shiftDays}d shift
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            onClick={onApplyCascade}
            disabled={isSubmitting}
            className="flex-1 flex items-center justify-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-blue-mid transition-all disabled:opacity-50 shadow-xs"
          >
            <Zap size={14} />
            {isSubmitting ? "Applying Cascade…" : "Apply Cascade & Reschedule All"}
          </button>

          <button
            onClick={onApplySingleOnly}
            disabled={isSubmitting}
            className="px-4 py-2.5 border border-border text-xs font-semibold text-slate hover:text-ink hover:bg-slate-100 rounded-xl transition-colors"
          >
            Keep Single Shift Only
          </button>

          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-3 py-2.5 text-xs text-muted hover:text-danger rounded-xl transition-colors"
          >
            Revert
          </button>
        </div>
      </div>
    </div>
  );
}
