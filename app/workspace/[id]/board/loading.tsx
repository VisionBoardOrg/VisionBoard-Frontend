import { BoardCanvasSkeleton } from "@/components/ui/Skeleton";

export default function BoardLoading() {
  return (
    <div role="status" aria-label="Loading board">
      <BoardCanvasSkeleton />
    </div>
  );
}
