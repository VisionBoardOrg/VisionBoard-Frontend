import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileText, Plus, Search, X } from "lucide-react";
import { ImportDocButton } from "@/components/docs/ImportDocButton";
import { getSlimWorkspaceMembership, getWorkspaceName } from "@/lib/workspace-data";

interface DocsPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; filter?: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getWorkspaceName(id);
  return { title: `Docs — ${workspace?.name ?? "VisionBoard"}` };
}

export default async function DocsPage({ params, searchParams }: DocsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const [{ id }, { q, filter }] = await Promise.all([params, searchParams]);

  const query = (q ?? "").trim();
  const activeFilter = filter ?? "all";

  const whereClause = {
    workspaceId: id,
    ...(query
      ? {
          title: {
            contains: query,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(activeFilter === "goal" ? { linkedGoalId: { not: null } } : {}),
    ...(activeFilter === "milestone" ? { linkedMilestoneId: { not: null } } : {}),
    ...(activeFilter === "task" ? { linkedTaskId: { not: null } } : {}),
    ...(activeFilter === "unlinked"
      ? { linkedGoalId: null, linkedMilestoneId: null, linkedTaskId: null }
      : {}),
  };

  // getSlimWorkspaceMembership is deduplicated with WorkspaceLayout via React.cache(),
  // and runs in parallel with the document list fetch.
  const [member, docs, totalCount] = await Promise.all([
    getSlimWorkspaceMembership(id, session.user.id),
    // Exclude the `content` JSONB blob — the list view only needs metadata.
    prisma.document.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        authorId: true,
        workspaceId: true,
        createdAt: true,
        updatedAt: true,
        linkedGoalId: true,
        linkedMilestoneId: true,
        linkedTaskId: true,
        linkedGoal: { select: { id: true, title: true } },
        linkedMilestone: { select: { id: true, title: true } },
        linkedTask: { select: { id: true, title: true } },
        author: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.document.count({ where: whereClause }),
  ]);

  if (!member) redirect("/dashboard");

  const filterTabs = [
    { id: "all", label: "All" },
    { id: "goal", label: "Linked to Goal" },
    { id: "milestone", label: "Linked to Milestone" },
    { id: "task", label: "Linked to Task" },
    { id: "unlinked", label: "Unlinked" },
  ];

  const hasActiveFilters = Boolean(query || activeFilter !== "all");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Connected Docs</h1>
          <p className="text-slate text-sm mt-1">
            Rich-text documents linked directly to goals, milestones, and tasks
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportDocButton workspaceId={id} />
          <Link
            href={`/workspace/${id}/docs/new`}
            className="flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
          >
            <Plus size={15} aria-hidden="true" /> New doc
          </Link>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <form action={`/workspace/${id}/docs`} method="GET" className="relative flex-1 max-w-md flex gap-2">
          {activeFilter !== "all" && (
            <input type="hidden" name="filter" value={activeFilter} />
          )}
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              defaultValue={query}
              aria-label="Search documents"
              placeholder="Search documents by title…"
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue/30 focus:border-blue"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-border text-ink rounded-xl hover:bg-offwhite transition-colors cursor-pointer"
          >
            Search
          </button>
          {hasActiveFilters && (
            <Link
              href={`/workspace/${id}/docs`}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-muted hover:text-ink rounded-xl border border-transparent hover:border-border transition-colors"
              title="Clear filters"
            >
              <X size={13} aria-hidden="true" /> Clear
            </Link>
          )}
        </form>

        <div className="flex items-center gap-1.5 flex-wrap">
          {filterTabs.map((tab) => {
            const href =
              tab.id === "all" && !query
                ? `/workspace/${id}/docs`
                : `/workspace/${id}/docs?${new URLSearchParams({
                    ...(query ? { q: query } : {}),
                    ...(tab.id !== "all" ? { filter: tab.id } : {}),
                  }).toString()}`;
            const isActive = activeFilter === tab.id;
            return (
              <Link
                key={tab.id}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-blue text-white"
                    : "bg-white border border-border text-slate hover:bg-offwhite"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {totalCount > 100 && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-4 py-2.5"
        >
          Showing the 100 most recently updated documents out of {totalCount}. Use the search bar
          above to locate older documents.
        </div>
      )}

      {docs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <FileText size={40} className="text-muted mx-auto mb-4" aria-hidden="true" />
          <h3 className="font-semibold text-ink">
            {hasActiveFilters ? "No matching documents" : "No documents yet"}
          </h3>
          <p className="text-sm text-slate mt-1 mb-5">
            {hasActiveFilters
              ? "Try a different search term or clear your active filter."
              : "Create a document and link it to any goal, milestone, or task."}
          </p>
          {hasActiveFilters ? (
            <Link
              href={`/workspace/${id}/docs`}
              className="inline-flex items-center gap-2 bg-white border border-border text-ink rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-offwhite transition-colors"
            >
              Reset filters
            </Link>
          ) : (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href={`/workspace/${id}/docs/new`}
                className="inline-flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
              >
                <Plus size={14} aria-hidden="true" /> Create first doc
              </Link>
              <ImportDocButton workspaceId={id} />
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <Link
              key={doc.id}
              href={`/workspace/${id}/docs/${doc.id}`}
              className="bg-white rounded-2xl border border-border p-5 hover:border-blue/40 hover:shadow-sm transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-faint flex items-center justify-center shrink-0">
                    <FileText size={15} className="text-blue" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold text-ink text-sm leading-tight line-clamp-2">
                    {doc.title}
                  </h3>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{doc.author?.name ?? "Unknown"}</span>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
              {(doc.linkedGoal || doc.linkedMilestone || doc.linkedTask) && (
                <div className="mt-3 pt-2.5 border-t border-border/60 flex gap-1.5 flex-wrap">
                  {doc.linkedGoal && (
                    <span
                      title={`Goal: ${doc.linkedGoal.title}`}
                      className="text-[10px] font-medium px-2 py-0.5 bg-blue-faint text-blue rounded-full max-w-full truncate"
                    >
                      Goal: {doc.linkedGoal.title}
                    </span>
                  )}
                  {doc.linkedMilestone && (
                    <span
                      title={`Milestone: ${doc.linkedMilestone.title}`}
                      className="text-[10px] font-medium px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full max-w-full truncate"
                    >
                      Milestone: {doc.linkedMilestone.title}
                    </span>
                  )}
                  {doc.linkedTask && (
                    <span
                      title={`Task: ${doc.linkedTask.title}`}
                      className="text-[10px] font-medium px-2 py-0.5 bg-cyan/10 text-cyan rounded-full max-w-full truncate"
                    >
                      Task: {doc.linkedTask.title}
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
