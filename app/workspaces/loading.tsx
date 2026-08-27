import { AppShell } from "@/components/layout/AppShell";
import { Skeleton, WorkspaceGridSkeleton } from "@/components/ui/Skeleton";

export default function WorkspacesLoading() {
  return (
    <AppShell workspaceId={null} role={null}>
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in-50 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-4 w-60" />
          </div>
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>

        {/* Workspaces Grid */}
        <WorkspaceGridSkeleton count={4} />
      </div>
    </AppShell>
  );
}
