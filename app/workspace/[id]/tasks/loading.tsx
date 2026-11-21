import { Skeleton } from "@/components/ui/Skeleton";

export default function TasksLoading() {
  return (
    <div
      role="status"
      aria-label="Loading tasks"
      className="space-y-6 animate-in fade-in-50 duration-200"
    >
      {/* Header: title, subtitle, count pills & Open Board button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>
      </div>

      {/* Controls row: scope toggle, search, priority select, new task button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-9 w-56 rounded-xl" />
          <Skeleton className="h-9 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>

      {/* Status filter pill bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[72, 96, 84, 88, 76, 68].map((w, i) => (
          <Skeleton key={i} className="h-7 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Grouped task cards */}
      {[3, 2].map((count, groupIdx) => (
        <div key={groupIdx} className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3.5 w-6" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: count }).map((_, cardIdx) => (
              <div
                key={cardIdx}
                className="bg-white rounded-2xl border border-border px-5 py-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
