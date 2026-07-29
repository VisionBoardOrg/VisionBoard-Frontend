"use client";

import React, { useState } from "react";
import { Sparkles, Activity, LayoutDashboard, Target, Cpu, TrendingUp, ShieldCheck, GitBranch } from "lucide-react";

interface RoleContent {
  id: string;
  tabLabel: string;
  badge: string;
  heading: string;
  description: string;
  features: {
    icon: React.ReactNode;
    title: string;
    description: string;
  }[];
  metrics: {
    label: string;
    value: number;
    color: string;
  }[];
}

const roleData: RoleContent[] = [
  {
    id: "product-managers",
    tabLabel: "Product Managers",
    badge: "PRODUCT MANAGERS",
    heading: "See the whole company at a glance.",
    description:
      "Product managers structure roadmaps, link user feedback to features, and keep team priorities clear.",
    features: [
      {
        icon: <Sparkles className="w-5 h-5 text-blue" />,
        title: "AI Roadmap Generator",
        description: "Dynamically updates features based on strategy and team capacity.",
      },
      {
        icon: <Activity className="w-5 h-5 text-blue" />,
        title: "Goal Health Score",
        description: "Real-time signal tracking to spot blockers before they hit release dates.",
      },
      {
        icon: <LayoutDashboard className="w-5 h-5 text-blue" />,
        title: "Company-wide dashboard",
        description: "High level summaries and drill downs into every project sprint.",
      },
    ],
    metrics: [
      { label: "Goals", value: 82, color: "bg-blue" },
      { label: "Product", value: 64, color: "bg-cyan" },
      { label: "Design", value: 90, color: "bg-purple-600" },
      { label: "Sprint", value: 71, color: "bg-amber-500" },
    ],
  },
  {
    id: "executive-strategy",
    tabLabel: "Executive Strategy",
    badge: "EXECUTIVE STRATEGY",
    heading: "Align vision with measurable outcomes.",
    description:
      "Executives get real-time portfolio visibility, resource allocation insights, and strategic goal alignment.",
    features: [
      {
        icon: <Target className="w-5 h-5 text-blue" />,
        title: "Strategic Alignment Score",
        description: "Ensure all team efforts directly map to top company objectives.",
      },
      {
        icon: <TrendingUp className="w-5 h-5 text-blue" />,
        title: "Resource Allocation Matrix",
        description: "Identify bottleneck teams and balance engineering investments.",
      },
      {
        icon: <ShieldCheck className="w-5 h-5 text-blue" />,
        title: "Executive Summaries",
        description: "Instant high-level summaries generated for board meetings.",
      },
    ],
    metrics: [
      { label: "Strategy", value: 94, color: "bg-blue" },
      { label: "Portfolio", value: 88, color: "bg-emerald-500" },
      { label: "Execution", value: 79, color: "bg-purple-600" },
      { label: "ROI", value: 92, color: "bg-cyan" },
    ],
  },
  {
    id: "engineering-ops",
    tabLabel: "Engineering & Ops",
    badge: "ENGINEERING & OPS",
    heading: "Streamline workflows and release cycles.",
    description:
      "Engineering leaders monitor velocity, dependency graphs, and deployment health in one unified board.",
    features: [
      {
        icon: <Cpu className="w-5 h-5 text-blue" />,
        title: "Automated Sprint Velocity",
        description: "AI-assisted sprint planning and accurate capacity forecasts.",
      },
      {
        icon: <GitBranch className="w-5 h-5 text-blue" />,
        title: "Dependency Mapping",
        description: "Detect cross-team blockers before they delay critical ship dates.",
      },
      {
        icon: <Activity className="w-5 h-5 text-blue" />,
        title: "CI/CD Deployment Health",
        description: "Seamlessly bridge roadmap items to GitHub & Jira workflows.",
      },
    ],
    metrics: [
      { label: "Velocity", value: 91, color: "bg-blue" },
      { label: "CI/CD", value: 98, color: "bg-emerald-500" },
      { label: "Reliability", value: 95, color: "bg-indigo-600" },
      { label: "Sprints", value: 86, color: "bg-cyan" },
    ],
  },
  {
    id: "marketing-growth",
    tabLabel: "Marketing & Growth",
    badge: "MARKETING & GROWTH",
    heading: "Synchronize launches with product releases.",
    description:
      "Growth teams coordinate GTM campaigns, feature announcements, and user acquisition funnels.",
    features: [
      {
        icon: <TrendingUp className="w-5 h-5 text-blue" />,
        title: "GTM Campaign Sync",
        description: "Map marketing collateral directly to upcoming product feature drops.",
      },
      {
        icon: <ShieldCheck className="w-5 h-5 text-blue" />,
        title: "Launch Readiness Tracker",
        description: "Ensure legal, support, and sales teams are 100% prepared.",
      },
      {
        icon: <Sparkles className="w-5 h-5 text-blue" />,
        title: "Adoption Analytics",
        description: "Track user onboarding and post-launch engagement metrics.",
      },
    ],
    metrics: [
      { label: "Campaigns", value: 85, color: "bg-purple-600" },
      { label: "GTM Sync", value: 92, color: "bg-blue" },
      { label: "Reach", value: 89, color: "bg-cyan" },
      { label: "Conversion", value: 78, color: "bg-emerald-500" },
    ],
  },
];

export default function RoleBasedViews() {
  const [activeTabId, setActiveTabId] = useState<string>("product-managers");

  const activeRole = roleData.find((r) => r.id === activeTabId) || roleData[0];

  return (
    <section className="py-20 px-6 md:px-12 bg-white border-t border-border">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Section Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue text-xs font-bold tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-blue animate-pulse" />
            VIEW ROLES
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight">
            One board. A different view for everyone.
          </h2>
          <p className="text-slate text-base md:text-lg max-w-xl mx-auto font-normal">
            Role-tailored dashboards ensure everyone stays focused on what matters most for their impact.
          </p>
        </div>

        {/* Role Tabs Selector */}
        <div className="flex flex-wrap justify-center items-center gap-3">
          {roleData.map((role) => {
            const isActive = role.id === activeTabId;
            return (
              <button
                key={role.id}
                onClick={() => setActiveTabId(role.id)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-blue text-white shadow-md shadow-blue/20 scale-105"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {role.tabLabel}
              </button>
            );
          })}
        </div>

        {/* Feature Split Card Box */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-8 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center shadow-sm">
          {/* Left Column: Text & Features */}
          <div className="lg:col-span-6 space-y-6">
            <span className="inline-block text-xs font-extrabold text-blue tracking-wider uppercase bg-blue-100/60 px-3 py-1 rounded-md">
              {activeRole.badge}
            </span>
            
            <h3 className="text-2xl md:text-3xl font-extrabold text-ink leading-tight">
              {activeRole.heading}
            </h3>

            <p className="text-slate text-sm md:text-base leading-relaxed">
              {activeRole.description}
            </p>

            {/* Bullet Feature List */}
            <div className="space-y-4 pt-2">
              {activeRole.features.map((feature, idx) => (
                <div key={idx} className="flex items-start gap-4">
                  <div className="p-2.5 rounded-xl bg-blue-100/70 shrink-0 mt-0.5">
                    {feature.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink">{feature.title}</h4>
                    <p className="text-xs md:text-sm text-slate-500 leading-snug">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Visual Dashboard Mockup */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-xl space-y-6">
              {/* Dashboard Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                    COMPANY STATUS
                  </h4>
                  <p className="text-sm font-bold text-ink">Overview Metrics</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Live Sync
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                {activeRole.metrics.map((metric, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2 hover:border-blue-200 transition-colors"
                  >
                    <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                      <span>{metric.label}</span>
                      <span className="text-ink font-bold">{metric.value}%</span>
                    </div>
                    <div className="text-2xl font-black text-ink">{metric.value}</div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${metric.color}`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Status footer pill */}
              <div className="pt-2 flex items-center justify-between text-xs text-slate-500 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                <span className="font-medium text-slate-700">Team Alignment Status</span>
                <span className="font-bold text-blue">Optimal (98%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
