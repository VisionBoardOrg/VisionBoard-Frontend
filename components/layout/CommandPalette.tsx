"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Search, Kanban, Target, FileText, ListTodo, LayoutDashboard, Building2,
  UserCircle, Users, Map, Layers, Settings, Zap, LogOut, CornerDownLeft, X, Flag, AlertCircle, RefreshCw,
} from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";

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
  kind: "task" | "goal" | "doc" | "milestone";
}

const LISTBOX_ID = "command-palette-listbox";

/**
 * Global ⌘K / Ctrl+K command palette — workspace content search (tasks, goals,
 * milestones, docs) plus navigation and quick actions. Mounted by AppShell
 * only while open, so each open starts from a fresh state.
 */
export function CommandPalette({ workspaceId, onClose, onOpenCopilot }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [items, setItems] = useState<SearchableDoc[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(Boolean(workspaceId));
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isMac, setIsMac] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus trap, Escape dismissal, scroll lock, and focus restoration
  useModalA11y(dialogRef, onClose, true, { initialFocusRef: inputRef });

  // Detect Mac vs non-Mac for keyboard shortcut display
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const platform = navigator.platform || navigator.userAgent || "";
      setIsMac(/mac|iphone|ipad|ipod/i.test(platform));
    }
  }, []);

  // Fetch searchable workspace content (tasks, goals + nested milestones, docs)
  const loadSearchableContent = useCallback(async () => {
    if (!workspaceId) return;
    setIsSearching(true);
    setSearchError(null);

    try {
      const [tasksRes, goalsRes, docsRes] = await Promise.all([
        fetch(`/api/tasks?workspaceId=${workspaceId}`),
        fetch(`/api/goals?workspaceId=${workspaceId}&limit=100`),
        fetch(`/api/documents?workspaceId=${workspaceId}&limit=100`),
      ]);

      const anyOk = tasksRes.ok || goalsRes.ok || docsRes.ok;
      if (!anyOk) {
        setSearchError("Could not load workspace items. You can still use navigation commands below.");
        setItems([]);
        return;
      }

      const [tasksData, goalsData, docsData] = await Promise.all([
        tasksRes.ok ? tasksRes.json() : { tasks: [] },
        goalsRes.ok ? goalsRes.json() : { goals: [] },
        docsRes.ok ? docsRes.json() : { documents: [] },
      ]);

      const goalsList: Array<{ id: string; title: string; milestones?: Array<{ id: string; title: string }> }> =
        goalsData.goals ?? [];

      const milestonesList: SearchableDoc[] = goalsList.flatMap((g) =>
        (g.milestones ?? []).map((m) => ({
          id: m.id,
          title: m.title,
          kind: "milestone" as const,
        }))
      );

      setItems([
        ...(tasksData.tasks ?? []).map((t: { id: string; title: string }) => ({
          id: t.id,
          title: t.title,
          kind: "task" as const,
        })),
        ...goalsList.map((g) => ({
          id: g.id,
          title: g.title,
          kind: "goal" as const,
        })),
        ...milestonesList,
        ...(docsData.documents ?? []).map((d: { id: string; title: string }) => ({
          id: d.id,
          title: d.title,
          kind: "doc" as const,
        })),
      ]);
    } catch {
      setSearchError("Network error loading workspace items.");
      setItems([]);
    } finally {
      setIsSearching(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadSearchableContent();
  }, [loadSearchableContent]);

  const navTo = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router]
  );

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
            if (i.kind === "milestone") {
              return {
                key: `milestone-${i.id}`,
                section: "Results" as const,
                title: i.title,
                subtitle: "Milestone — opens Roadmap",
                icon: Flag,
                run: () => navTo(`/workspace/${workspaceId}/roadmap?milestoneId=${i.id}`),
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
              run: () => navTo(`/workspace/${workspaceId}/tasks?taskId=${i.id}`),
            };
          })
      : [];

    const navItems: ResultItem[] = [
      ...(workspaceId
        ? [
            { title: "Overview", icon: Users, href: `/workspace/${workspaceId}/workspace` },
            { title: "Board", icon: Kanban, href: `/workspace/${workspaceId}/board` },
            { title: "Goals", icon: Target, href: `/workspace/${workspaceId}/goals` },
            { title: "My Tasks", icon: ListTodo, href: `/workspace/${workspaceId}/tasks` },
            { title: "Roadmap", icon: Map, href: `/workspace/${workspaceId}/roadmap` },
            { title: "Docs", icon: FileText, href: `/workspace/${workspaceId}/docs` },
            { title: "Templates", icon: Layers, href: `/workspace/${workspaceId}/templates` },
            { title: "Workspace Settings", icon: Settings, href: `/workspace/${workspaceId}/settings` },
            { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
            { title: "My Workspaces", icon: Building2, href: "/workspaces" },
          ]
        : [
            { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
            { title: "Workspaces", icon: Building2, href: "/workspaces" },
          ]),
      { title: "Account", icon: UserCircle, href: "/account" },
    ]
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
        ? [
            {
              key: "action-copilot",
              section: "Actions" as const,
              title: "Open AI Copilot",
              subtitle: isMac ? "⌘J" : "Ctrl+J",
              icon: Zap,
              run: () => {
                onClose();
                onOpenCopilot();
              },
            },
          ]
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
  }, [query, items, workspaceId, isMac, navTo, onClose, onOpenCopilot]);

  // Clamp the active index as the result list shrinks (derived, not stored)
  const safeActiveIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);
  const activeOptionId =
    results.length > 0 ? `command-palette-option-${safeActiveIndex}` : undefined;

  // Keyboard navigation attached to the dialog container
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      // Allow Enter on explicit buttons (like Close or Retry) to execute their own click
      if (
        e.target instanceof HTMLButtonElement &&
        e.target.getAttribute("role") !== "option"
      ) {
        return;
      }
      e.preventDefault();
      const item = results[safeActiveIndex];
      if (item) item.run();
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
      <div
        ref={dialogRef}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-xl bg-white rounded-2xl border border-border shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2.5 px-4 border-b border-border">
          <Search size={18} className="text-muted shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={true}
            aria-autocomplete="list"
            aria-controls={LISTBOX_ID}
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={
              workspaceId
                ? "Search tasks, goals, milestones, docs, or commands…"
                : "Search commands…"
            }
            className="flex-1 h-14 bg-transparent text-sm font-medium text-ink placeholder:text-muted focus:outline-none"
            aria-label="Search commands and workspace items"
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && (
            <span className="text-xs text-muted shrink-0" aria-live="polite">
              Loading…
            </span>
          )}
          <kbd className="hidden sm:inline-flex items-center h-6 px-2 rounded-md bg-offwhite border border-border text-[11px] font-semibold text-slate shrink-0">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="min-w-9 min-h-9 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-offwhite transition-colors cursor-pointer shrink-0 -mr-1.5"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Results */}
        <div
          id={LISTBOX_ID}
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto py-2"
          role="listbox"
          aria-label="Search results and commands"
        >
          {searchError && (
            <div
              role="alert"
              className="mx-3 mb-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <AlertCircle size={14} className="text-amber-700 shrink-0" aria-hidden="true" />
                <span className="truncate">{searchError}</span>
              </span>
              <button
                type="button"
                onClick={() => void loadSearchableContent()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 transition-colors shrink-0 cursor-pointer"
              >
                <RefreshCw size={11} aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {isSearching && query.trim().length > 0 && (
            <div className="px-4 py-3 text-xs text-slate flex items-center gap-2" role="status">
              <div className="w-3.5 h-3.5 border-2 border-blue border-t-transparent rounded-full animate-spin" />
              <span>Searching workspace items…</span>
            </div>
          )}

          {!isSearching && results.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-medium text-ink">
                {query ? `No matches for “${query}”` : "Start typing to search"}
              </p>
              <p className="text-xs text-slate mt-1">
                {workspaceId
                  ? "Search across tasks, goals, milestones, and documents, or jump anywhere in the workspace."
                  : "Open a workspace to search its tasks, goals, milestones, and documents."}
              </p>
            </div>
          )}

          {sections.map((section) => (
            <div key={section.label} role="group" aria-label={section.label}>
              <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted select-none">
                {section.label}
              </div>
              {section.items.map(({ item, index }) => {
                const Icon = item.icon;
                const active = index === safeActiveIndex;
                return (
                  <button
                    key={item.key}
                    id={`command-palette-option-${index}`}
                    type="button"
                    tabIndex={-1}
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
                      <span
                        className={`block text-sm truncate ${
                          active ? "text-blue font-semibold" : "text-ink font-medium"
                        }`}
                      >
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
            <kbd className="inline-flex items-center h-5 px-1.5 rounded bg-white border border-border text-[10px] font-semibold">
              ↑↓
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center h-5 px-1.5 rounded bg-white border border-border text-[10px] font-semibold">
              ↵
            </kbd>
            select
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center h-5 px-1.5 rounded bg-white border border-border text-[10px] font-semibold">
              esc
            </kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
