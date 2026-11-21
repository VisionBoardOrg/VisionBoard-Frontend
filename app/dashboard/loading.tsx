import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, SummaryCardsSkeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <AppShell workspaceId={null} role={null}>
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in-50 duration-200">
        {/* Welcome Header Skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>

        {/* Summary Cards Skeleton */}
        <SummaryCardsSkeleton />

        {/* Workspaces 2-Column Grid Skeleton */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-border p-5 space-y-4"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-3.5 w-28" />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
