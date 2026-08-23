"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirmations render a red confirm button */
  danger?: boolean;
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

interface PendingConfirm extends ConfirmOptions {
  id: number;
}

/**
 * App-wide styled replacement for window.confirm(). Returns a promise that
 * resolves true when confirmed, false when cancelled/dismissed.
 *
 *   const { confirm } = useConfirm();
 *   if (!(await confirm({ title: "Delete goal?", danger: true }))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const nextId = useRef(1);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // Only one dialog at a time — auto-dismiss any previous one
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setPending({ ...options, id: nextId.current++ });
      }),
    []
  );

  // Focus the safe action when the dialog opens (confirm button only for
  // non-destructive asks; cancel button for danger asks)
  useEffect(() => {
    if (!pending) return;
    const target = pending.danger ? cancelRef.current : confirmRef.current;
    requestAnimationFrame(() => target?.focus());
  }, [pending]);

  // Keyboard: Escape cancels, Enter confirms
  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter" && document.activeElement !== cancelRef.current) {
        e.preventDefault();
        settle(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {pending && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-ink/40" onClick={() => settle(false)} aria-hidden="true" />

          <div className="relative w-full max-w-md bg-white rounded-2xl border border-border shadow-2xl p-6">
            <div className="flex items-start gap-3">
              {pending.danger && (
                <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} className="text-danger" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0">
                <h2 id="confirm-dialog-title" className="text-lg font-bold text-ink leading-snug">
                  {pending.title}
                </h2>
                {pending.description && (
                  <p className="text-sm text-slate mt-1.5 leading-relaxed">{pending.description}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                ref={cancelRef}
                onClick={() => settle(false)}
                className="h-10 px-4 rounded-xl border-[1.5px] border-border bg-white text-sm font-semibold text-slate hover:bg-offwhite transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/40"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmRef}
                onClick={() => settle(true)}
                className={`h-10 px-4 rounded-xl text-sm font-semibold text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 ${
                  pending.danger
                    ? "bg-danger hover:bg-red-600"
                    : "bg-blue hover:bg-blue-mid"
                }`}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextType {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
