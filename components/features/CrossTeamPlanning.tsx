"use client";

import React from "react";
import {
  Sparkles,
  Users,
  Target,
  Calendar,
  Sliders,
  Milestone,
  LucideIcon,
} from "lucide-react";

interface FeatureItem {
  title: string;
  description: string;
  icon: LucideIcon;
}

const features: FeatureItem[] = [
  {
    title: "AI Roadmaps",
    description:
      "Generate strategic roadmaps, milestones, and timelines with AI-powered planning.",
    icon: Sparkles,
  },
  {
    title: "Shared Workspaces",
    description:
      "Collaborate across teams in one connected execution workspace.",
    icon: Users,
  },
  {
    title: "Goal Alignment",
    description:
      "Align company goals, projects, and execution flows clearly.",
    icon: Target,
  },
  {
    title: "Timeline Planning",
    description:
      "Visualize milestones, dependencies, and execution progress in real time.",
    icon: Calendar,
  },
  {
    title: "Priority Management",
    description:
      "Organize initiatives and keep teams focused on what matters most.",
    icon: Sliders,
  },
  {
    title: "Smart Milestones",
    description:
      "Break large goals into trackable execution steps automatically.",
    icon: Milestone,
  },
];

export default function CrossTeamPlanning() {
  return (
    <section className="py-20 px-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-14">
        <h2 className="text-[32px] sm:text-[40px] font-extrabold text-ink tracking-tight mb-3">
          Cross–team planning
        </h2>
        <p className="text-[16px] sm:text-[17px] text-slate font-medium leading-relaxed">
          Keep every team aligned with shared roadmaps, structured workflows, and
          connected planning.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, idx) => {
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
