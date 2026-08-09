import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/** Base animated skeleton pulse element */
export function Skeleton({ className = "", ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-slate-200/80 ${className}`}
      {...props}
    />
  );
}

/** Header Skeleton (Title + Subtitle + Action Button) */
export function PageHeaderSkeleton({
  titleWidth = "w-44",
  subtitleWidth = "w-64",
  hasButton = true,
}: {
  titleWidth?: string;
  subtitleWidth?: string;
  hasButton?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/70">
      <div className="space-y-2">
        <Skeleton className={`h-7 ${titleWidth}`} />
        <Skeleton className={`h-4 ${subtitleWidth}`} />
      </div>
      {hasButton && <Skeleton className="h-9 w-32 rounded-lg shrink-0" />}
    </div>
  );
}

/** Skeleton for Personal Summary Cards (Dashboard) */
export function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="p-5 rounded-xl border border-border bg-white space-y-3.5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3.5 w-32" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for Workspace Cards grid (Workspaces & Dashboard) */
export function WorkspaceGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-xl border border-border bg-white space-y-4 shadow-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
            <Skeleton className="h-5 w-14 rounded-full shrink-0" />
          </div>
          <div className="grid grid-cols-3 gap-2.5 pt-3 border-t border-border/60">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-20 rounded-lg shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for Goals List Page */
export function GoalsSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-56" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 rounded-xl border border-border bg-white space-y-4 shadow-xs"
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-3/5" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-4/5" />
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Kanban Board view */
export function KanbanBoardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border/70">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-7 w-28 rounded-full" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-start">
        {[1, 2, 3, 4].map((col) => (
          <div
            key={col}
            className="bg-slate-100/70 rounded-xl p-3.5 space-y-3 border border-border/80"
          >
            <div className="flex items-center justify-between px-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            {[1, 2, 3].map((card) => (
              <div
                key={card}
                className="bg-white p-4 rounded-lg border border-border space-y-3 shadow-xs"
              >
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-3 w-2/3" />
                <div className="flex items-center justify-between pt-1">
                  <Skeleton className="h-4 w-14 rounded-full" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Tasks Table / List view */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton titleWidth="w-32" subtitleWidth="w-48" />

      <div className="bg-white rounded-xl border border-border divide-y divide-border/70 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50/80 flex items-center justify-between">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 flex-1 min-w-0">
              <Skeleton className="h-4 w-4 rounded shrink-0" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full shrink-0" />
            <Skeleton className="h-4 w-28 shrink-0" />
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for Form / Account Settings Section */
export function AccountSettingsSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2 pb-4 border-b border-border/70">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Profile Section Box */}
      <div className="p-6 rounded-xl border border-border bg-white space-y-6 shadow-xs">
        <div className="flex items-center gap-5">
          <Skeleton className="h-16 w-16 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-60" />
          </div>
        </div>
        <div className="space-y-4 pt-4 border-t border-border/60">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Privacy Section Box */}
      <div className="p-6 rounded-xl border border-border bg-white space-y-4 shadow-xs">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
