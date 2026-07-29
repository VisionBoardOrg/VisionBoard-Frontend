"use client";

import React from "react";
import { Bot, Sliders, LineChart, MessageSquareCode } from "lucide-react";

interface AICard {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const aiCards: AICard[] = [
  {
    icon: <Bot className="w-6 h-6 text-cyan-400" />,
    title: "Roadmap Generator",
    description:
      "Instantly generate comprehensive feature roadmaps from unstructured specs, documents, and business goals.",
  },
  {
    icon: <Sliders className="w-6 h-6 text-blue-400" />,
    title: "Goal Deconstructor",
    description:
      "Break down high-level quarterly objectives into actionable sub-tasks, owner assignments, and sprint milestones.",
  },
  {
    icon: <LineChart className="w-6 h-6 text-emerald-400" />,
    title: "Progress Insights",
    description:
      "Intelligent velocity tracking and predictive alerts that notify managers weeks before deadlines slip.",
  },
  {
    icon: <MessageSquareCode className="w-6 h-6 text-purple-400" />,
    title: "Natural Language Editing",
    description:
      "Update board items, assign dependencies, and adjust sprint capacity using simple plain text commands.",
  },
];

export default function AIFeaturesSection() {
  return (
    <section className="py-20 px-6 md:px-12 bg-white border-t border-border">
      <div className="max-w-6xl mx-auto">
        {/* Dark Container Box */}
        <div className="bg-[#0A0F1D] text-white rounded-[32px] p-8 md:p-14 relative overflow-hidden shadow-2xl border border-slate-800">
          {/* Subtle Background Glow Spheres */}
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-blue-600/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[350px] h-[350px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none" />

          {/* Header */}
          <div className="text-center space-y-4 max-w-2xl mx-auto relative z-10 mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 text-cyan-400 border border-cyan-500/30 text-xs font-bold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              AI DRIVEN
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              An AI assistant built into every board.
            </h2>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">
              From writing specs to forecasting delays, AI helps teams move faster without extra meetings.
            </p>
          </div>

          {/* 4 Dark Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {aiCards.map((card, idx) => (
              <div
                key={idx}
                className="bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 hover:bg-slate-900 transition-all duration-200 group flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-800/80 group-hover:bg-slate-800 flex items-center justify-center transition-colors">
                    {card.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-slate-400 text-xs md:text-sm leading-relaxed">
                    {card.description}
                  </p>
                </div>

                <div className="pt-6 mt-4 border-t border-slate-800/80 flex items-center text-xs font-semibold text-cyan-400 group-hover:text-cyan-300">
                  Explore AI feature &rarr;
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
