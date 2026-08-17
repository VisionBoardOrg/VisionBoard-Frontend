"use client";

import React from "react";
import Link from "next/link";
import { FileText, Target, MapPin, ListTodo, MessageSquare, ExternalLink } from "lucide-react";

export interface CitationProps {
  id?: string;
  entityType: string;
  entityId: string;
  title: string;
  url?: string;
  snippet?: string;
  workspaceId?: string;
}

const TYPE_CONFIG: Record<
  string,
  {
    icon: React.ElementType;
    bg: string;
    text: string;
    border: string;
    label: string;
  }
> = {
  document: {
    icon: FileText,
    bg: "bg-blue-50 hover:bg-blue-100",
    text: "text-blue",
    border: "border-blue-200",
    label: "Doc",
  },
  goal: {
    icon: Target,
    bg: "bg-emerald-50 hover:bg-emerald-100",
    text: "text-emerald-700",
    border: "border-emerald-200",
    label: "Goal",
  },
  milestone: {
    icon: MapPin,
    bg: "bg-amber-50 hover:bg-amber-100",
    text: "text-amber-700",
    border: "border-amber-200",
    label: "Milestone",
  },
  task: {
    icon: ListTodo,
    bg: "bg-purple-50 hover:bg-purple-100",
    text: "text-purple-700",
    border: "border-purple-200",
    label: "Task",
  },
  comment: {
    icon: MessageSquare,
    bg: "bg-slate-50 hover:bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200",
    label: "Comment",
  },
};

export function CitationBadge({
  entityType,
  entityId,
  title,
  url,
  snippet,
  workspaceId,
}: CitationProps) {
  const normalizedType = entityType.toLowerCase();
  const config = TYPE_CONFIG[normalizedType] || TYPE_CONFIG.document;
  const Icon = config.icon;

  const targetUrl =
    url ||
    (workspaceId
      ? normalizedType === "document"
        ? `/workspace/${workspaceId}/docs/${entityId}`
        : normalizedType === "goal"
        ? `/workspace/${workspaceId}/goals?goalId=${entityId}`
        : normalizedType === "milestone"
        ? `/workspace/${workspaceId}/roadmap?milestoneId=${entityId}`
        : `/workspace/${workspaceId}/tasks?taskId=${entityId}`
      : "#");

  return (
    <Link
      href={targetUrl}
      title={snippet ? `${config.label}: ${title}\n"${snippet}"` : `${config.label}: ${title}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 mr-1 text-xs font-medium rounded-md border transition-all duration-150 group cursor-pointer ${config.bg} ${config.text} ${config.border} shadow-2xs hover:shadow-xs`}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate max-w-[150px] sm:max-w-[220px]">{title}</span>
      <ExternalLink size={10} className="opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

/**
 * Parses markdown text containing `[[cite:entityType:entityId:Title]]` tokens
 * and renders them with interactive CitationBadge components.
 */
export function renderContentWithCitations(
  text: string,
  workspaceId?: string
): React.ReactNode[] {
  const citationRegex = /\[\[cite:(document|goal|milestone|task|comment):([^:]+):([^\]]+)\]\]/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    const [, entityType, entityId, title] = match;
    parts.push(
      <CitationBadge
        key={`${entityId}-${matchIndex}`}
        entityType={entityType}
        entityId={entityId}
        title={title}
        workspaceId={workspaceId}
      />
    );

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
