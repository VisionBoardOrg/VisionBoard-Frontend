"use client";

import { FileText, MessageSquare, Workflow, LucideIcon } from "lucide-react";

interface DocFeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

const docFeatures: DocFeatureItem[] = [
  {
    title: "Connect Docs",
    description: "Keep planning and documentation inside the same workflow.",
    icon: FileText,
  },
  {
    title: "Meeting Notes",
    description:
      "Attach discussions and decisions directly to projects and milestones.",
    icon: MessageSquare,
  },
  {
    title: "Linked Workflows",
    description:
      "Connect documentation to tasks, timelines, and execution updates.",
    icon: Workflow,
  },
];

export default function ConnectedDocs() {
  return (
    <section className="py-20 px-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-14">
        <h2 className="text-[32px] sm:text-[40px] font-extrabold text-ink tracking-tight mb-3">
          Documentation that stays connected
        </h2>
        <p className="text-[16px] sm:text-[17px] text-slate font-medium leading-relaxed">
          Link notes, decisions, and workflows directly to execution plans and team activity.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {docFeatures.map((feature, idx) => {
          const Icon = feature.icon;
          return (
            <div
              key={idx}
              className="bg-white border border-border rounded-2xl p-7 shadow-xs hover:shadow-md hover:border-blue-light transition-all flex flex-col justify-start group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-faint border border-blue-light/60 flex items-center justify-center text-blue mb-5 group-hover:scale-105 transition-transform">
                <Icon className="w-6 h-6 stroke-[2.2]" />
              </div>
              <h3 className="text-xl font-bold text-ink mb-2 tracking-tight">
                {feature.title}
              </h3>
              <p className="text-[15px] text-slate font-medium leading-relaxed">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
