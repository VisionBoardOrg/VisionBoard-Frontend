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

const DocEditorInner = dynamic(
  () => import("./DocEditor").then((m) => ({ default: m.DocEditor })),
  { ssr: false }
);

export function DocEditor(props: DocEditorProps) {
  return <DocEditorInner {...props} />;
}
