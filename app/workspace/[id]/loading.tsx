import { TableSkeleton } from "@/components/ui/Skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="animate-in fade-in-50 duration-200">
      <TableSkeleton rows={6} />
    </div>
  );
}
