import { AppShell } from "@/components/layout/AppShell";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default async function WorkspaceOverviewLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        <PageHeaderSkeleton titleWidth="w-48" subtitleWidth="w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-xl border border-border bg-white space-y-3 shadow-xs">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
