import { AppShell } from "@/components/layout/AppShell";
import { PageHeaderSkeleton, KanbanBoardSkeleton } from "@/components/ui/Skeleton";

export default async function BoardLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="space-y-6 animate-in fade-in-50 duration-200">
        <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-60" />
        <KanbanBoardSkeleton />
      </div>
    </AppShell>
  );
}
