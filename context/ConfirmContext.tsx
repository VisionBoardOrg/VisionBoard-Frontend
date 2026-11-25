"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive confirmations render a high-contrast red confirm button and default focus to Cancel */
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
 * App-wide accessible confirmation dialog (role="alertdialog", focus trap,
 * focus restoration, Escape-to-cancel, safe initial focus on Cancel for danger asks).
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const nextId = useRef(1);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      const { promise, resolve } = Promise.withResolvers<boolean>();
      // Only one dialog at a time — auto-dismiss any previous one
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setPending({ ...options, id: nextId.current++ });
      return promise;
    },
    []
  );

  // Native <dialog> modal presentation, Escape dismissal, and safe initial focus
  useModalA11y(dialogRef, () => settle(false), Boolean(pending), {
    initialFocusRef: pending?.danger ? cancelRef : confirmRef,
  });

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {pending && (
        <dialog
          ref={dialogRef}
          {...({ closedby: "any" } as React.DialogHTMLAttributes<HTMLDialogElement>)}
          aria-labelledby="confirm-dialog-title"
          aria-describedby={pending.description ? "confirm-dialog-description" : undefined}
          className="m-auto w-full max-w-md bg-white rounded-2xl border border-border shadow-2xl p-6 backdrop:bg-ink/40"
        >
          <div>
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
                  <p id="confirm-dialog-description" className="text-sm text-slate mt-1.5 leading-relaxed">
                    {pending.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                ref={cancelRef}
                onClick={() => settle(false)}
                className="h-10 px-4 rounded-xl border-[1.5px] border-border bg-white text-sm font-semibold text-slate hover:bg-offwhite transition-colors cursor-pointer"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                ref={confirmRef}
                onClick={() => settle(true)}
                className={`h-10 px-4 rounded-xl text-sm font-semibold text-white transition-colors cursor-pointer ${
                  pending.danger
                    ? "bg-danger hover:bg-red-700"
                    : "bg-blue hover:bg-blue-mid"
                }`}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </dialog>
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
