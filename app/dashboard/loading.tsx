import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, SummaryCardsSkeleton, WorkspaceGridSkeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <AppShell workspaceId={null} role={null}>
      <div className="space-y-8 animate-in fade-in-50 duration-200">
        {/* Header Skeleton */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <SummaryCardsSkeleton />
        </section>

        {/* Workspaces Grid Skeleton */}
        <section className="space-y-4 pt-2 border-t border-border/80">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-4 w-28" />
          </div>
          <WorkspaceGridSkeleton count={3} />
        </section>
      </div>
    </AppShell>
  );
}
