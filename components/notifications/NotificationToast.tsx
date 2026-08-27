"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { X, Bell } from "lucide-react";
import type { NotificationResponseItem } from "@/lib/notifications";

interface NotificationToastProps {
  event: NotificationResponseItem | null;
  onDismiss: () => void;
}

export function NotificationToast({ event, onDismiss }: NotificationToastProps) {
  useEffect(() => {
    if (!event) return;

    // Auto-dismiss after 6 seconds
    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);

    return () => clearTimeout(timer);
  }, [event, onDismiss]);

  if (!event) return null;

  const content = (
    <div className="flex items-start gap-3 p-4 bg-white/95 backdrop-blur-md border border-blue/30 shadow-2xl rounded-2xl max-w-sm w-full pointer-events-auto ring-1 ring-blue/10 animate-in slide-in-from-top-4 fade-in duration-200">
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
          <div className="w-9 h-9 rounded-xl bg-blue-faint text-blue border border-blue-light flex items-center justify-center shadow-2xs">
            <Bell size={18} />
          </div>
        )}
      </div>

      {/* Message Text */}
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-xs font-bold text-ink truncate">{event.title}</p>
        <p className="text-xs text-slate mt-0.5 line-clamp-2 leading-relaxed">
          {event.message}
        </p>
        {event.link && (
          <span className="inline-block text-[11px] font-semibold text-blue hover:underline mt-1.5">
            View details →
          </span>
        )}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss();
        }}
        className="p-1 rounded-lg text-slate-400 hover:text-ink hover:bg-offwhite transition-colors cursor-pointer"
        aria-label="Dismiss notification toast"
      >
        <X size={14} />
      </button>
    </div>
  );

  return (
    <div className="fixed top-4 right-4 z-50 pointer-events-none">
      {event.link ? (
        <Link href={event.link} prefetch={false} onClick={onDismiss} className="pointer-events-auto block no-underline">
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}
