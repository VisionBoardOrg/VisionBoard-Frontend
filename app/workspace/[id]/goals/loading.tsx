import { GoalsSkeleton } from "@/components/ui/Skeleton";

export default function GoalsLoading() {
  return (
    <div className="animate-in fade-in-50 duration-200">
      <GoalsSkeleton />
    </div>
  );
}
