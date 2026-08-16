import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { TEMPLATES, TemplateName } from "@/lib/templates";
import { TemplateApplyButton } from "@/components/workspace/TemplateApplyButton";
import { Target, Map, ClipboardList, Zap, LayoutTemplate, Package, LucideIcon } from "lucide-react";

interface TemplatesPageProps {
  params: Promise<{ id: string }>;
}

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutTemplate,
  Target,
  Map,
  ClipboardList,
  Zap,
};

export default async function TemplatesPage({ params }: TemplatesPageProps) {
  const session = await auth();
  if (!session) redirect("/auth/login");
  const { id } = await params;

  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: id, userId: session.user.id } },
    include: { workspace: { select: { ownerId: true } } },
  });
  if (!member) redirect("/dashboard");

  const canApply =
    member.workspace.ownerId === session.user.id ||
    member.role === "admin" ||
    member.role === "pm";

  const templateList = Object.entries(TEMPLATES).map(([key, value]) => ({
    id: key as TemplateName,
    ...value,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Workspace Templates</h1>
        <p className="text-slate text-sm mt-1">
          Pre-built frameworks for product, engineering, and leadership teams.
          Applying a template adds sample goals, milestones, and tasks — it won&apos;t delete existing data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {templateList.map((tmpl) => {
          const Icon = ICON_MAP[tmpl.icon] ?? Package;
          return (
            <div
              key={tmpl.id}
              className="bg-white rounded-2xl border border-border p-6 flex flex-col justify-between hover:border-blue/40 transition-all shadow-sm group"
            >
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue/10 text-blue flex items-center justify-center shrink-0 group-hover:bg-blue group-hover:text-white transition-colors">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-ink text-base">{tmpl.name}</h2>
                  </div>
                </div>
                <p className="text-sm text-slate leading-relaxed mb-4">{tmpl.description}</p>

                <div className="flex flex-wrap gap-1.5 text-xs text-muted mb-4">
                  <span className="bg-offwhite border border-border rounded-full px-2.5 py-0.5 font-medium text-slate">
                    {tmpl.data.goals.length} goal{tmpl.data.goals.length !== 1 ? "s" : ""}
                  </span>
                  <span className="bg-offwhite border border-border rounded-full px-2.5 py-0.5 font-medium text-slate">
                    {tmpl.data.goals.reduce((s, g) => s + g.milestones.length, 0)} milestones
                  </span>
                  {tmpl.data.sprints.length > 0 && (
                    <span className="bg-offwhite border border-border rounded-full px-2.5 py-0.5 font-medium text-slate">
                      {tmpl.data.sprints.length} sprints
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <TemplateApplyButton
                  workspaceId={id}
                  templateId={tmpl.id}
                  templateName={tmpl.name}
                  canApply={canApply}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

