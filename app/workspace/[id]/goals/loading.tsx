import { AppShell } from "@/components/layout/AppShell";
import { GoalsSkeleton } from "@/components/ui/Skeleton";

export default async function GoalsLoading(props?: {
  params?: Promise<{ id?: string }>;
}) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const id = resolvedParams?.id ?? null;

  return (
    <AppShell workspaceId={id} role={null}>
      <div className="animate-in fade-in-50 duration-200">
        <GoalsSkeleton />
      </div>
    </AppShell>
  );
}
