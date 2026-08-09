import { AppShell } from "@/components/layout/AppShell";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/Skeleton";

export default async function TemplatesLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-64" hasButton={false} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-5 rounded-xl border border-border bg-white space-y-3.5 shadow-xs">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-9 w-full rounded-lg pt-2" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
