import { AppShell } from "@/components/layout/AppShell";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default async function DocsLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        <PageHeaderSkeleton titleWidth="w-28" subtitleWidth="w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5 rounded-xl border border-border bg-white space-y-3 shadow-xs">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
              <div className="flex justify-between items-center pt-3 border-t border-border/60">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-5 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
