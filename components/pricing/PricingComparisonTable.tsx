"use client";

import React from "react";

export default function PricingComparisonTable() {
  const categories = [
    {
      name: "Workspace",
      features: [
        { name: "Workspaces", free: "1", startup: "5", growth: "Unlimited", enterprise: "Unlimited" },
        { name: "Team members", free: "Up to 5", startup: "Up to 25", growth: "Up to 100", enterprise: "Unlimited" },
        { name: "Cloud storage space", free: "10GB", startup: "100GB", growth: "1TB", enterprise: "Custom" },
        { name: "Roadmap views & filtering", free: true, startup: true, growth: true, enterprise: true },
      ],
    },
    {
      name: "Progress Tracking",
      features: [
        { name: "Custom roadmap status", free: "1 filter", startup: true, growth: true, enterprise: true },
        { name: "Milestone management", free: false, startup: true, growth: true, enterprise: true },
        { name: "Timeline & Gantt view (coming soon)", free: false, startup: false, growth: true, enterprise: true },
      ],
    },
    {
      name: "AI Co-Pilot",
      features: [
        { name: "AI credits / suggestions", free: "10 / month", startup: "100 / month", growth: "Unlimited", enterprise: "Unlimited" },
        { name: "AI roadmap generator", free: false, startup: true, growth: true, enterprise: true },
        { name: "Goal deconstructor", free: false, startup: true, growth: true, enterprise: true },
        { name: "Natural language board editing", free: false, startup: false, growth: true, enterprise: true },
      ],
    },
    {
      name: "Collaboration",
      features: [
        { name: "Real-time co-editing", free: true, startup: true, growth: true, enterprise: true },
        { name: "Role-based permissions", free: false, startup: true, growth: true, enterprise: true },
        { name: "Activity logs history", free: "7 days", startup: "30 days", growth: "90 days", enterprise: "Unlimited" },
      ],
    },
    {
      name: "Security & Support",
      features: [
        { name: "TLS encryption & secure sessions", free: true, startup: true, growth: true, enterprise: true },
        { name: "SSO / SAML (coming soon)", free: false, startup: false, growth: false, enterprise: true },
        { name: "Support", free: "Community", startup: "Email", growth: "Priority", enterprise: "Dedicated Manager" },
      ],
    },
  ];

  const renderValue = (val: boolean | string) => {
    if (typeof val === "boolean") {
      return val ? (
        <svg className="w-5 h-5 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <span className="text-slate-300 font-medium">—</span>
      );
    }
    return <span className="text-xs md:text-sm font-medium text-slate-700">{val}</span>;
  };

  return (
    <section className="py-16 px-4 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <span className="text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
          Compare All
        </span>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mt-3 tracking-tight">
          Everything included, side by side.
        </h2>
        <p className="text-sm md:text-base text-slate-600 mt-2 max-w-xl mx-auto">
          All plan features at a glance. Compare plans and find the right features for your business need.
        </p>
      </div>

      {/* Comparison Table Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th className="py-4 px-6 text-sm font-bold text-slate-900 w-2/5">Feature</th>
              <th className="py-4 px-4 text-sm font-bold text-slate-900 text-center w-3/20">Free</th>
              <th className="py-4 px-4 text-sm font-bold text-blue-600 text-center w-3/20 bg-blue-50/40">Startup</th>
              <th className="py-4 px-4 text-sm font-bold text-slate-900 text-center w-3/20">Growth</th>
              <th className="py-4 px-4 text-sm font-bold text-slate-900 text-center w-3/20">Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <React.Fragment key={category.name}>
                {/* Category Header Row */}
                <tr className="bg-blue-50/40 border-y border-slate-200/80">
                  <td colSpan={5} className="py-2.5 px-6 text-xs font-bold text-blue-700 tracking-wide">
                    {category.name}
                  </td>
                </tr>

                {/* Category Feature Rows */}
                {category.features.map((feature, idx) => (
                  <tr
                    key={feature.name}
                    className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors ${
                      idx % 2 === 1 ? "bg-slate-50/30" : ""
                    }`}
                  >
                    <td className="py-3.5 px-6 text-xs md:text-sm font-medium text-slate-800">
                      {feature.name}
                    </td>
                    <td className="py-3.5 px-4 text-center">{renderValue(feature.free)}</td>
                    <td className="py-3.5 px-4 text-center bg-blue-50/20">{renderValue(feature.startup)}</td>
                    <td className="py-3.5 px-4 text-center">{renderValue(feature.growth)}</td>
                    <td className="py-3.5 px-4 text-center">{renderValue(feature.enterprise)}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
