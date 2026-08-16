import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { ImportDocButton } from "@/components/docs/ImportDocButton";

interface DocsPageProps { params: Promise<{ id: string }> }

export default async function DocsPage({ params }: DocsPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  // Exclude the `content` JSONB blob — the list view only needs metadata.
  // content can be megabytes per document (especially with embedded images).
  const docs = await prisma.document.findMany({
    where: { workspaceId: id },
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
      author: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100, // safety cap — paginate if needed
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Connected Docs</h1>
          <p className="text-slate text-sm mt-1">Rich-text documents linked directly to goals, milestones, and tasks</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ImportDocButton workspaceId={id} />
          <Link
            href={`/workspace/${id}/docs/new`}
            className="flex items-center gap-2 bg-blue text-white rounded-xl px-4 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors"
          >
            <Plus size={15} /> New doc
          </Link>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center">
          <FileText size={40} className="text-muted mx-auto mb-4" />
          <h3 className="font-semibold text-ink">No documents yet</h3>
          <p className="text-sm text-slate mt-1 mb-5">Create a document and link it to any goal, milestone, or task.</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href={`/workspace/${id}/docs/new`} className="inline-flex items-center gap-2 bg-blue text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-mid transition-colors">
              <Plus size={14} /> Create first doc
            </Link>
            <ImportDocButton workspaceId={id} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docs.map((doc) => (
            <Link
              key={doc.id}
              href={`/workspace/${id}/docs/${doc.id}`}
              className="bg-white rounded-2xl border border-border p-5 hover:border-blue/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-faint flex items-center justify-center shrink-0">
                  <FileText size={15} className="text-blue" />
                </div>
                <h3 className="font-semibold text-ink text-sm leading-tight line-clamp-2">{doc.title}</h3>
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{doc.author?.name ?? "Unknown"}</span>
                <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
              </div>
              {(doc.linkedGoalId || doc.linkedMilestoneId || doc.linkedTaskId) && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {doc.linkedGoalId && <span className="text-[10px] px-2 py-0.5 bg-blue-faint text-blue rounded-full">Goal</span>}
                  {doc.linkedMilestoneId && <span className="text-[10px] px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full">Milestone</span>}
                  {doc.linkedTaskId && <span className="text-[10px] px-2 py-0.5 bg-cyan/10 text-cyan rounded-full">Task</span>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
