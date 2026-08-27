"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Search, Kanban, Target, FileText, ListTodo, LayoutDashboard, Building2,
  UserCircle, Users, Map, Layers, Settings, Zap, LogOut, CornerDownLeft,
} from "lucide-react";

interface CommandPaletteProps {
  workspaceId: string | null;
  onClose: () => void;
  onOpenCopilot: () => void;
}

interface ResultItem {
  key: string;
  section: "Results" | "Navigate" | "Actions";
  title: string;
  subtitle?: string;
  icon: typeof Search;
  run: () => void;
}

interface SearchableDoc {
  id: string;
  title: string;
  kind: "task" | "goal" | "doc";
}

/**
 * Global ⌘K command palette — workspace content search (tasks, goals, docs)
 * plus navigation and quick actions. Mounted by AppShell only while open, so
 * each open starts from a fresh state.
 */
export function CommandPalette({ workspaceId, onClose, onOpenCopilot }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [items, setItems] = useState<SearchableDoc[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(Boolean(workspaceId));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch searchable workspace content once per mount
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    const fetchAll = async () => {
      try {
        const [tasksRes, goalsRes, docsRes] = await Promise.all([
          fetch(`/api/tasks?workspaceId=${workspaceId}`),
          fetch(`/api/goals?workspaceId=${workspaceId}&limit=100`),
          fetch(`/api/documents?workspaceId=${workspaceId}&limit=100`),
        ]);
        const [tasksData, goalsData, docsData] = await Promise.all([
          tasksRes.ok ? tasksRes.json() : { tasks: [] },
          goalsRes.ok ? goalsRes.json() : { goals: [] },
          docsRes.ok ? docsRes.json() : { documents: [] },
        ]);
        if (cancelled) return;
        setItems([
          ...(tasksData.tasks ?? []).map((t: { id: string; title: string }) => ({ id: t.id, title: t.title, kind: "task" as const })),
          ...(goalsData.goals ?? []).map((g: { id: string; title: string }) => ({ id: g.id, title: g.title, kind: "goal" as const })),
          ...(docsData.documents ?? []).map((d: { id: string; title: string }) => ({ id: d.id, title: d.title, kind: "doc" as const })),
        ]);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Focus the input on mount (wait a frame so it's in the DOM)
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const navTo = (href: string) => {
    onClose();
    router.push(href);
  };

  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();

    const contentMatches: ResultItem[] = q
      ? items
          .filter((i) => i.title.toLowerCase().includes(q))
          .slice(0, 8)
          .map((i) => {
            if (i.kind === "goal") {
              return {
                key: `goal-${i.id}`,
                section: "Results" as const,
                title: i.title,
                subtitle: "Goal",
                icon: Target,
                run: () => navTo(`/workspace/${workspaceId}/goals/${i.id}`),
              };
            }
            if (i.kind === "doc") {
              return {
                key: `doc-${i.id}`,
                section: "Results" as const,
                title: i.title,
                subtitle: "Document",
                icon: FileText,
                run: () => navTo(`/workspace/${workspaceId}/docs/${i.id}`),
              };
            }
            return {
              key: `task-${i.id}`,
              section: "Results" as const,
              title: i.title,
              subtitle: "Task — opens My Tasks",
              icon: ListTodo,
              run: () => navTo(`/workspace/${workspaceId}/tasks`),
            };
          })
      : [];

    const navItems: ResultItem[] = [
      workspaceId
        ? [
            { title: "Overview", icon: Users, href: `/workspace/${workspaceId}/workspace` },
            { title: "Board", icon: Kanban, href: `/workspace/${workspaceId}/board` },
            { title: "Goals", icon: Target, href: `/workspace/${workspaceId}/goals` },
            { title: "My Tasks", icon: ListTodo, href: `/workspace/${workspaceId}/tasks` },
            { title: "Roadmap", icon: Map, href: `/workspace/${workspaceId}/roadmap` },
            { title: "Docs", icon: FileText, href: `/workspace/${workspaceId}/docs` },
            { title: "Templates", icon: Layers, href: `/workspace/${workspaceId}/templates` },
            { title: "Workspace Settings", icon: Settings, href: `/workspace/${workspaceId}/settings` },
            { title: "My Workspaces", icon: Building2, href: "/workspaces" },
          ]
        : [
            { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
            { title: "Workspaces", icon: Building2, href: "/workspaces" },
          ],
      { title: "Account", icon: UserCircle, href: "/account" },
    ]
      .flat()
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .map((n) => ({
        key: `nav-${n.title}`,
        section: "Navigate" as const,
        title: n.title,
        icon: n.icon,
        run: () => navTo(n.href),
      }));

    const actionItems: ResultItem[] = [
      ...(workspaceId
        ? [{
            key: "action-copilot",
            section: "Actions" as const,
            title: "Open AI Copilot",
            subtitle: "⌘J",
            icon: Zap,
            run: () => {
              onClose();
              onOpenCopilot();
            },
          }]
        : []),
      {
        key: "action-signout",
        section: "Actions" as const,
        title: "Sign out",
        icon: LogOut,
        run: () => {
          onClose();
          signOut({ callbackUrl: "/auth/login" });
        },
      },
    ].filter((a) => !q || a.title.toLowerCase().includes(q));

    return [...contentMatches, ...navItems, ...actionItems];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, items, workspaceId]);

  // Clamp the active index as the result list shrinks (derived, not stored)
  const safeActiveIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[safeActiveIndex];
      if (item) item.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Scroll the active item into view
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${safeActiveIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [safeActiveIndex]);

  // Group consecutive items by section label for rendering
  const sections: { label: string; items: { item: ResultItem; index: number }[] }[] = [];
  results.forEach((item, index) => {
    const last = sections[sections.length - 1];
    if (last && last.label === item.section) {
      last.items.push({ item, index });
    } else {
      sections.push({ label: item.section, items: [{ item, index }] });
    }
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Search and commands"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search size={18} className="text-muted shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={workspaceId ? "Search tasks, goals, docs, or type a command…" : "Search commands…"}
            className="flex-1 h-14 bg-transparent text-sm font-medium text-ink placeholder:text-muted focus:outline-none"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && (
            <span className="text-xs text-muted shrink-0">Loading…</span>
          )}
          <kbd className="hidden sm:inline-flex items-center h-6 px-2 rounded-md bg-offwhite border border-border text-[11px] font-semibold text-slate shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2" role="listbox" aria-label="Results">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink">
                {query ? `No matches for “${query}”` : "Start typing to search"}
              </p>
              <p className="text-xs text-slate mt-1">
                {workspaceId
                  ? "Search across tasks, goals, and documents, or jump anywhere in the workspace."
                  : "Open a workspace to search its tasks, goals, and documents."}
              </p>
            </div>
          )}

          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted select-none">
                {section.label}
              </div>
              {section.items.map(({ item, index }) => {
                const Icon = item.icon;
                const active = index === safeActiveIndex;
                return (
                  <button
                    key={item.key}
                    data-index={index}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={item.run}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                      active ? "bg-blue-faint" : "bg-transparent"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={`shrink-0 ${active ? "text-blue" : "text-slate"}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${active ? "text-blue font-semibold" : "text-ink font-medium"}`}>
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="block text-xs text-slate truncate">{item.subtitle}</span>
                      )}
                    </span>
                    {active && (
                      <CornerDownLeft size={14} className="text-blue shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-border bg-offwhite/60 text-[11px] text-slate">
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center h-5 px-1.5 rounded bg-white border border-border text-[10px] font-semibold">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center h-5 px-1.5 rounded bg-white border border-border text-[10px] font-semibold">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center h-5 px-1.5 rounded bg-white border border-border text-[10px] font-semibold">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
