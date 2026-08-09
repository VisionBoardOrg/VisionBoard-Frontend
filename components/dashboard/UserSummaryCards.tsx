"use client";

import { User, CheckCircle2, Briefcase, ListTodo } from "lucide-react";

interface UserSummaryCardsProps {
  userName: string;
  userEmail: string;
  userImage?: string | null;
  workspaceCount: number;
  assignedTaskCount: number;
  completionRate: number;
}

import { useState } from "react";

export function UserSummaryCards({
  userName,
  userEmail,
  userImage,
  workspaceCount,
  assignedTaskCount,
  completionRate,
}: UserSummaryCardsProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-border p-5 flex items-center gap-4 sm:col-span-2 lg:col-span-1">
        {userImage && !imgError ? (
          <img
            src={userImage}
            alt={userName}
            onError={() => setImgError(true)}
            className="w-12 h-12 rounded-2xl object-cover border border-border shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-2xl bg-blue/10 text-blue flex items-center justify-center shrink-0">
            <User size={22} />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{userName}</p>
          <p className="text-xs text-muted truncate">{userEmail}</p>
        </div>
      </div>

      {/* Workspace count */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-3">
          <Briefcase size={18} />
        </div>
        <div className="text-2xl font-bold text-ink">{workspaceCount}</div>
        <div className="text-xs text-muted mt-0.5">
          Workspace{workspaceCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Assigned tasks */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
          <ListTodo size={18} />
        </div>
        <div className="text-2xl font-bold text-ink">{assignedTaskCount}</div>
        <div className="text-xs text-muted mt-0.5">Assigned Tasks</div>
      </div>

      {/* Completion rate */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
          <CheckCircle2 size={18} />
        </div>
        <div className="text-2xl font-bold text-ink">{completionRate.toFixed(1)}%</div>
        <div className="text-xs text-muted mt-0.5">Task Completion</div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, completionRate)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
