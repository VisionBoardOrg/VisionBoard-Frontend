import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { TEMPLATES, TemplateName } from "@/lib/templates";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

interface TemplatesPageProps {
  params: Promise<{ id: string }>;
}

export default async function TemplatesPage({ params }: TemplatesPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
  });
  if (!member) redirect("/dashboard");

  const templateList = Object.entries(TEMPLATES).map(([key, value]) => ({
    id: key as TemplateName,
    ...value,
  }));

  return (
    <AppShell workspaceId={id} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Workspace Templates</h1>
          <p className="text-slate text-sm mt-1">Pre-built frameworks for product, engineering, and leadership teams</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templateList.map((tmpl) => (
            <div
              key={tmpl.id}
              className="bg-white rounded-2xl border border-border p-6 flex flex-col justify-between hover:border-blue/40 transition-all shadow-sm"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{tmpl.icon}</span>
                  <div>
                    <h2 className="font-semibold text-ink text-base">{tmpl.name}</h2>
                  </div>
                </div>
                <p className="text-sm text-slate leading-relaxed mb-4">{tmpl.description}</p>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs font-medium text-slate">
                  {tmpl.data.goals.length} Pre-configured Goals
                </span>
                <Link
                  href={`/workspace/${id}/board`}
                  className="flex items-center gap-1 text-xs font-semibold text-blue hover:text-blue-mid transition-colors"
                >
                  View in board <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
