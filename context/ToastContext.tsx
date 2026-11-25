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
  const [liveMessage, setLiveMessage] = useState<string>("");
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const stackRef = useRef<HTMLDivElement>(null);
  const dismissBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const priorFocusRef = useRef<HTMLElement | null>(null);

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number, fromUserDismiss = false) => {
      clearTimer(id);
      setToasts((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (fromUserDismiss) {
          requestAnimationFrame(() => {
            const nextToast = next[idx] ?? next[idx - 1];
            if (nextToast) {
              dismissBtnRefs.current.get(nextToast.id)?.focus();
            } else if (priorFocusRef.current?.isConnected) {
              priorFocusRef.current.focus();
            }
          });
        }
        return next;
      });
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id: number, duration: number) => {
      clearTimer(id);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id, false), duration)
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

  // Promote the toast stack into the Top Layer via popover="manual" when toasts are active
  useEffect(() => {
    const el = stackRef.current as (HTMLDivElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
    }) | null;
    if (!el || typeof el.showPopover !== "function") return;
    try {
      if (toasts.length > 0) {
        if (!el.matches(":popover-open")) el.showPopover();
      } else if (el.matches(":popover-open")) {
        el.hidePopover?.();
      }
    } catch {
      // Ignore if popover state transition is unsupported
    }
  }, [toasts.length]);

  const toast = useCallback(
    ({ title, description, type = "info", duration = 5000 }: ToastOptions) => {
      const id = nextId.current++;
      if (typeof document !== "undefined") {
        priorFocusRef.current = document.activeElement as HTMLElement | null;
        const announcement = description ? `${title}. ${description}` : title;
        const docWithAriaNotify = document as Document & {
          ariaNotify?: (msg: string, opts?: { priority?: "high" | "normal" }) => void;
        };
        if (typeof docWithAriaNotify.ariaNotify === "function") {
          docWithAriaNotify.ariaNotify(announcement, {
            priority: type === "error" ? "high" : "normal",
          });
        } else {
          setLiveMessage(announcement);
        }
      }
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
      {/* Pre-mounted hidden live region fallback when ariaNotify() is unavailable */}
      <div className="sr-only">
        {liveMessage && <p>Screen reader announcements</p>}
        <div aria-live="polite" aria-atomic="true">
          {liveMessage}
        </div>
      </div>
      {/* Toast stack — Top-Layer popover="manual" region */}
      <div
        ref={stackRef}
        role="region"
        aria-label="Notifications"
        {...({ popover: "manual" } as React.HTMLAttributes<HTMLDivElement>)}
        className="fixed inset-auto bottom-4 right-4 m-0 p-0 bg-transparent border-0 z-[90] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((t) => {
          const { icon: Icon, iconClass } = TOAST_STYLES[t.type];
          const isError = t.type === "error";
          return (
            <div
              key={t.id}
              role={isError ? "alert" : "status"}
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
                ref={(el) => {
                  if (el) dismissBtnRefs.current.set(t.id, el);
                  else dismissBtnRefs.current.delete(t.id);
                }}
                onClick={() => dismiss(t.id, true)}
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
