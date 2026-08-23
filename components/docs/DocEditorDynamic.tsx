"use client";

import dynamic from "next/dynamic";

interface DocEditorProps {
  workspaceId: string;
  initialData?: {
    id?: string;
    title: string;
    content: unknown;
    linkedGoalId?: string | null;
    linkedMilestoneId?: string | null;
    linkedTaskId?: string | null;
  };
  goals?: { id: string; title: string }[];
  milestones?: { id: string; title: string }[];
}

/**
 * Skeleton shown while the TipTap editor chunk loads. Matches the editor's
 * approximate footprint (toolbar + title + ~300px content area) to avoid
 * layout shift.
 */
function DocEditorSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-white border border-border rounded-2xl p-6 min-h-[420px] animate-pulse"
    >
      <div className="h-7 w-1/3 rounded-lg bg-border/70 mb-4" />
      <div className="h-4 w-2/3 rounded bg-border/50 mb-6" />
      <div className="space-y-3">
        <div className="h-3 w-full rounded bg-border/40" />
        <div className="h-3 w-11/12 rounded bg-border/40" />
        <div className="h-3 w-4/5 rounded bg-border/40" />
        <div className="h-3 w-full rounded bg-border/40" />
        <div className="h-3 w-3/5 rounded bg-border/40" />
      </div>
    </div>
  );
}

const DocEditorInner = dynamic(
  () => import("./DocEditor").then((m) => ({ default: m.DocEditor })),
  { ssr: false, loading: () => <DocEditorSkeleton /> }
);

export function DocEditor(props: DocEditorProps) {
  return <DocEditorInner {...props} />;
}
