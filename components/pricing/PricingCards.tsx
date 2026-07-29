"use client";

import React, { useState } from "react";
import WaitlistModal from "../waitlist/WaitlistModal";

interface PricingCardsProps {
  isAnnual: boolean;
}

export default function PricingCards({ isAnnual }: PricingCardsProps) {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

  const plans = [
    {
      name: "Free",
      description: "For individuals & small teams exploring product design",
      priceMonthly: "$0",
      priceAnnual: "$0",
      period: "/month",
      popular: false,
      ctaText: "Join Waitlist — Coming Soon",
      ctaVariant: "outline",
      features: [
        "1 Workspace",
        "Up to 5 team members",
        "10GB cloud storage space",
        "Standard roadmap views & filtering",
        "30-day version history & logs",
        "Community support",
      ],
    },
    {
      name: "Startup",
      description: "For growing teams that need core features to power their roadmap",
      priceMonthly: "$29",
      priceAnnual: "$23",
      period: "/month",
      popular: true,
      ctaText: "Join Waitlist — Coming Soon",
      ctaVariant: "solid",
      features: [
        "5 Workspaces",
        "Up to 25 team members",
        "100GB cloud storage space",
        "Full roadmap & timeline views",
        "Advanced filtering & search",
        "Priority customer support",
        "Unlimited export",
      ],
    },
    {
      name: "Growth",
      description: "For scaling companies looking to optimize execution",
      priceMonthly: "$79",
      priceAnnual: "$63",
      period: "/month",
      popular: false,
      ctaText: "Join Waitlist — Coming Soon",
      ctaVariant: "outline",
      features: [
        "Unlimited workspaces",
        "Up to 100 team members",
        "1TB cloud storage space",
        "Custom workflow automation & rules",
        "Advanced analytics & reporting",
        "Priority phone & chat support",
      ],
    },
    {
      name: "Enterprise",
      description: "For large organizations with complex needs",
      priceCustom: "Custom",
      priceSub: "Tailored plan for your scale",
      popular: false,
      ctaText: "Join Waitlist — Coming Soon",
      ctaVariant: "outline",
      features: [
        "Everything in Growth plus:",
        "Unlimited team members",
        "Unlimited storage",
        "Dedicated account manager & SLA",
        "Custom SSO & security controls",
        "Custom integrations & API access",
      ],
    },
  ];

  return (
    <section className="py-8 px-4 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {plans.map((plan) => {
          const isPopular = plan.popular;
          const displayPrice = plan.priceCustom
            ? plan.priceCustom
            : isAnnual
            ? plan.priceAnnual
            : plan.priceMonthly;

          return (
            <div
              key={plan.name}
              className={`relative rounded-2xl bg-white p-6 flex flex-col justify-between transition-all duration-200 ${
                isPopular
                  ? "border-2 border-blue-600 shadow-xl ring-4 ring-blue-500/10 z-10 scale-[1.02] md:scale-100 lg:scale-[1.02]"
                  : "border border-slate-200 shadow-sm hover:shadow-md"
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-blue-600 text-white font-semibold text-[11px] uppercase tracking-wider px-3.5 py-1 rounded-full shadow-sm">
                    Most Popular
                  </span>
                </div>
              )}

              <div>
                {/* Header */}
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="text-xs text-slate-500 mt-1 min-h-[36px] leading-relaxed">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mt-5 mb-6">
                  {plan.priceCustom ? (
                    <div>
                      <span className="text-3xl lg:text-4xl font-extrabold text-slate-900">
                        {plan.priceCustom}
                      </span>
                      <p className="text-xs text-slate-500 mt-1">{plan.priceSub}</p>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
                        {displayPrice}
                      </span>
                      <span className="text-sm font-medium text-slate-500">{plan.period}</span>
                    </div>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  type="button"
                  onClick={() => setIsWaitlistOpen(true)}
                  className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all duration-150 ${
                    plan.ctaVariant === "solid"
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-[0.99]"
                      : "border border-blue-600 text-blue-600 hover:bg-blue-50/80 active:scale-[0.99]"
                  }`}
                >
                  {plan.ctaText}
                </button>

                {/* Divider */}
                <hr className="my-6 border-slate-100" />

                {/* Feature List */}
                <ul className="space-y-3 text-xs md:text-sm text-slate-700">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <svg
                        className="w-4 h-4 text-blue-600 shrink-0 mt-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={feature.startsWith("Everything in") ? "font-medium text-slate-500" : ""}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <WaitlistModal
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
      />
    </section>
  );
}

