"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, Bell } from "lucide-react";
import type { NotificationResponseItem } from "@/lib/notifications";

interface NotificationToastProps {
  event: NotificationResponseItem | null;
  onDismiss: () => void;
}

export function NotificationToast({ event, onDismiss }: NotificationToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!event || paused) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);

    return () => clearTimeout(timer);
  }, [event, paused, onDismiss]);

  if (!event) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 pointer-events-none max-w-[calc(100vw-2rem)]">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setPaused(false);
          }
        }}
        className="relative flex items-start gap-3 p-4 bg-white/95 backdrop-blur-md border border-blue/30 shadow-2xl rounded-2xl max-w-sm w-full pointer-events-auto ring-1 ring-blue/10 animate-in slide-in-from-bottom-4 fade-in duration-200"
      >
        {/* Icon / Actor Image */}
        <div className="shrink-0 mt-0.5">
          {event.actor?.image ? (
            <Image
              src={event.actor.image}
              alt={event.actor.name || "User"}
              width={36}
              height={36}
              unoptimized
              className="w-9 h-9 rounded-full object-cover border border-blue-light"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-xl bg-blue-faint text-blue border border-blue-light flex items-center justify-center shadow-2xs"
              aria-hidden="true"
            >
              <Bell size={18} aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Message Text & Optional Link (no nested button inside link) */}
        <div className="flex-1 min-w-0 pr-2">
          <p className="text-xs font-bold text-ink truncate">{event.title}</p>
          <p className="text-xs text-slate mt-0.5 line-clamp-2 leading-relaxed">
            {event.message}
          </p>
          {event.link && (
            <Link
              href={event.link}
              prefetch={false}
              onClick={onDismiss}
              className="inline-block text-xs font-semibold text-blue hover:underline mt-1.5"
            >
              View details →
            </Link>
          )}
        </div>

        {/* Close button (sibling, never nested in a Link) */}
        <button
          type="button"
          onClick={onDismiss}
          className="min-w-7 min-h-7 flex items-center justify-center -mr-1 -mt-1 rounded-lg text-slate hover:text-ink hover:bg-offwhite transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss notification toast"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
