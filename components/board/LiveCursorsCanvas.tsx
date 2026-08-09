"use client";

import React from "react";
import type { RemoteCursor } from "@/hooks/useWebSocket";

interface LiveCursorsCanvasProps {
  cursors: Record<string, RemoteCursor>;
  currentUserId?: string | null;
}

export function LiveCursorsCanvas({ cursors, currentUserId }: LiveCursorsCanvasProps) {
  const remoteCursors = Object.values(cursors).filter(
    (c) => c.userId && c.userId !== currentUserId
  );

  if (remoteCursors.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-visible">
      {remoteCursors.map((cursor) => (
        <div
          key={cursor.userId}
          className="absolute left-0 top-0 will-change-transform pointer-events-none"
          style={{
            transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
            transition: "transform 120ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {/* Custom SVG Mouse Pointer */}
          <svg
            className="w-5 h-5 drop-shadow-md"
            viewBox="0 0 24 24"
            fill="none"
            style={{ color: cursor.userColor }}
          >
            <path
              d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
              fill="currentColor"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>

          {/* Floating User Name & Avatar Pill Badge */}
          <div
            className="absolute left-3 top-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold text-white shadow-lg whitespace-nowrap border border-white/20 select-none animate-in fade-in zoom-in-90 duration-150"
            style={{ backgroundColor: cursor.userColor }}
          >
            {cursor.userImage ? (
              <img
                src={cursor.userImage}
                alt={cursor.userName}
                className="w-4 h-4 rounded-full object-cover border border-white/40"
              />
            ) : (
              <span className="w-3.5 h-3.5 rounded-full bg-white/20 text-[9px] font-bold flex items-center justify-center uppercase">
                {cursor.userName.charAt(0)}
              </span>
            )}
            <span className="truncate max-w-[120px] tracking-tight text-[11px]">
              {cursor.userName}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
