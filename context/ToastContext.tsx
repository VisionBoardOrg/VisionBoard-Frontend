"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastOptions {
  title: string;
  description?: string;
  type?: ToastType;
  /** Auto-dismiss delay in ms. Pass 0 to require manual dismissal. */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, "title" | "type">> {
  id: number;
  description?: string;
}

interface ToastContextType {
  toast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TOAST_STYLES: Record<ToastType, { icon: typeof Info; iconClass: string }> = {
  success: { icon: CheckCircle2, iconClass: "text-success" },
  error: { icon: AlertCircle, iconClass: "text-danger" },
  info: { icon: Info, iconClass: "text-blue" },
};

/**
 * App-wide lightweight toast system for action feedback (save failures,
 * confirmations). Mount <ToastProvider> once near the app shell root.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, type = "info", duration = 5000 }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, title, description, type }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — bottom-right, above all app chrome */}
      <div
        className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const { icon: Icon, iconClass } = TOAST_STYLES[t.type];
          return (
            <div
              key={t.id}
              className="flex items-start gap-3 bg-white border border-border rounded-2xl shadow-lg p-4"
            >
              <Icon size={18} className={`${iconClass} shrink-0 mt-0.5`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink leading-snug">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-slate mt-1 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="p-1 -m-1 rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
