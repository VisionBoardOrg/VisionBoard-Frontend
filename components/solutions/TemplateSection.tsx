"use client";

import React from "react";
import { Target, Layers, Calendar, Zap } from "lucide-react";

interface TemplateCard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const templates: TemplateCard[] = [
  {
    icon: <Target className="w-6 h-6 text-blue" />,
    title: "OKR Board",
    description:
      "Align objectives, key results, and quarterly targets with real-time tracking across all departments.",
  },
  {
    icon: <Layers className="w-6 h-6 text-blue" />,
    title: "Product Roadmap",
    description:
      "Visual timeline connecting user feedback, feature requests, and strategic priorities to upcoming releases.",
  },
  {
    icon: <Calendar className="w-6 h-6 text-blue" />,
    title: "Quarterly Plan",
    description:
      "Map strategic goals to resource allocation, team bandwidth, and high-impact quarterly milestones.",
  },
  {
    icon: <Zap className="w-6 h-6 text-blue" />,
    title: "Sprint Board",
    description:
      "Agile tracking with automated velocity forecasts, daily standup summaries, and blocker resolution.",
  },
];

export default function TemplateSection() {
  return (
    <section className="py-20 px-6 md:px-12 bg-offwhite border-t border-border">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue text-xs font-bold tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-blue animate-pulse" />
            TEMPLATES
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight">
            Start from a template built for the way you plan.
          </h2>
          <p className="text-slate text-base md:text-lg max-w-xl mx-auto font-normal">
            Preset workflows tailored to your team&apos;s methodologies so you can launch in minutes.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {templates.map((tpl, idx) => (
            <div
              key={idx}
              className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200 group flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                  {tpl.icon}
                </div>
                <h3 className="text-lg font-bold text-ink group-hover:text-blue transition-colors">
                  {tpl.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {tpl.description}
                </p>
              </div>

              <div className="pt-6 mt-2 border-t border-slate-100 flex items-center text-xs font-semibold text-blue group-hover:underline">
                Use template &rarr;
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
