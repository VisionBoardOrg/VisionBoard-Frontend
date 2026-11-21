"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
  duration: number;
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
 * App-wide accessible toast system:
 * - Pauses auto-dismiss on pointer hover or keyboard focus (WCAG 2.2.1)
 * - Uses role="alert" + aria-live="assertive" for error toasts, role="status" for info/success
 * - Cleans up timers on eviction and unmount
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id: number, duration: number) => {
      clearTimer(id);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [clearTimer, dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const toast = useCallback(
    ({ title, description, type = "info", duration = 5000 }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((prev) => {
        const next = [...prev, { id, title, description, type, duration }];
        if (next.length > 4) {
          const evicted = next.slice(0, next.length - 4);
          for (const item of evicted) clearTimer(item.id);
          return next.slice(-4);
        }
        return next;
      });
      scheduleDismiss(id, duration);
    },
    [clearTimer, scheduleDismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast stack — bottom-right, above all app chrome */}
      <div
        className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none"
        aria-label="Notifications"
      >
        {toasts.map((t) => {
          const { icon: Icon, iconClass } = TOAST_STYLES[t.type];
          const isError = t.type === "error";
          return (
            <div
              key={t.id}
              role={isError ? "alert" : "status"}
              aria-live={isError ? "assertive" : "polite"}
              aria-atomic="true"
              onMouseEnter={() => clearTimer(t.id)}
              onMouseLeave={() => scheduleDismiss(t.id, t.duration)}
              onFocus={() => clearTimer(t.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  scheduleDismiss(t.id, t.duration);
                }
              }}
              className="pointer-events-auto flex items-start gap-3 bg-white border border-border rounded-2xl shadow-lg p-4"
            >
              <Icon size={18} className={`${iconClass} shrink-0 mt-0.5`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink leading-snug">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-slate mt-1 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="min-w-7 min-h-7 flex items-center justify-center -mr-1 -mt-1 rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X size={15} aria-hidden="true" />
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
