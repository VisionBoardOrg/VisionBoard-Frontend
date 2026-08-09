import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";

export default async function WorkspaceSettingsLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in-50 duration-200">
        <div className="space-y-1.5 pb-4 border-b border-border/70">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>

        <div className="p-6 rounded-xl border border-border bg-white space-y-6 shadow-xs">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
