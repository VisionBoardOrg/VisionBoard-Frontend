import { PageHeaderSkeleton, KanbanBoardSkeleton } from "@/components/ui/Skeleton";

export default function BoardLoading() {
  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <PageHeaderSkeleton titleWidth="w-36" subtitleWidth="w-60" />
      <KanbanBoardSkeleton />
    </div>
  );
}
