import { AppShell } from "@/components/layout/AppShell";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default async function RoadmapLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-64" />
        <div className="p-6 rounded-xl border border-border bg-white space-y-6 shadow-xs">
          <div className="flex gap-4 border-b border-border pb-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-6 w-24 rounded-md" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
