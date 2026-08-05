"use client";

/**
 * PricingCards — public pricing page plan grid.
 *
 * For authenticated users who already have a workspace the upgrade buttons
 * call /api/stripe/checkout directly and redirect to Stripe.
 *
 * For unauthenticated visitors the buttons link to /auth/register so they
 * can create an account first.
 */

import React, { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2 } from "lucide-react";

interface PricingCardsProps {
  isAnnual: boolean;
  /** Optionally pass the active workspace ID for authenticated in-app upgrades. */
  workspaceId?: string;
}

type PaidTier = "startup" | "growth" | "enterprise";

const plans = [
  {
    name: "Free",
    tier: null,
    description: "For individuals & small teams exploring product design",
    priceMonthly: "$0",
    priceAnnual: "$0",
    period: "/month",
    popular: false,
    ctaText: "Get Started Free",
    ctaVariant: "outline" as const,
    features: [
      "1 Workspace",
      "Up to 5 team members",
      "5 MB document storage",
      "Standard roadmap views & filtering",
      "7-day activity log",
      "Community support",
    ],
  },
  {
    name: "Startup",
    tier: "startup" as PaidTier,
    description: "For growing teams that need core features to power their roadmap",
    priceMonthly: "$29",
    priceAnnual: "$23",
    period: "/month",
    popular: true,
    ctaText: "Start Startup Plan",
    ctaVariant: "solid" as const,
    features: [
      "5 Workspaces",
      "Up to 25 team members",
      "100 MB document storage",
      "Full roadmap & board views",
      "Sprint & milestone tracking",
      "Role-based permissions",
      "Priority email support",
    ],
  },
  {
    name: "Growth",
    tier: "growth" as PaidTier,
    description: "For scaling companies looking to optimize execution",
    priceMonthly: "$79",
    priceAnnual: "$63",
    period: "/month",
    popular: false,
    ctaText: "Start Growth Plan",
    ctaVariant: "outline" as const,
    features: [
      "Unlimited workspaces",
      "Up to 100 team members",
      "1 GB document storage",
      "Unlimited AI credits",
      "AI roadmap & goal deconstructor",
      "Extended 90-day activity history",
    ],
  },
  {
    name: "Enterprise",
    tier: "enterprise" as PaidTier,
    description: "For large organizations with complex needs",
    priceCustom: "Custom",
    priceSub: "Tailored plan for your scale",
    popular: false,
    ctaText: "Contact Sales",
    ctaVariant: "outline" as const,
    features: [
      "Everything in Growth plus:",
      "Unlimited team members",
      "Unlimited storage",
      "Dedicated account manager & SLA",
      "SSO & advanced security controls",
      "Custom onboarding & API access",
    ],
  },
] as const;

export default function PricingCards({ isAnnual, workspaceId }: PricingCardsProps) {
  const [loadingTier, setLoadingTier] = useState<PaidTier | null>(null);
  const [error, setError] = useState("");

  async function handleCheckout(tier: PaidTier) {
    if (!workspaceId) return; // shouldn't happen — button becomes a link in this case
    setError("");
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          tier,
          period: isAnnual ? "annual" : "monthly",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoadingTier(null);
    }
  }

  return (
    <section className="py-8 px-4 max-w-7xl mx-auto">
      {error && (
        <div className="mb-6 text-center text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-xl mx-auto">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {plans.map((plan) => {
          const isPopular = plan.popular;
          const displayPrice = "priceCustom" in plan && plan.priceCustom
            ? plan.priceCustom
            : isAnnual
            ? (plan as { priceAnnual?: string }).priceAnnual
            : (plan as { priceMonthly?: string }).priceMonthly;

          const isLoading = loadingTier === plan.tier;

          // Determine button behaviour
          const isEnterprise = plan.tier === "enterprise";
          const isFree = plan.tier === null;

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
                  {"priceCustom" in plan && plan.priceCustom ? (
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
                      <span className="text-sm font-medium text-slate-500">{"period" in plan ? plan.period : ""}</span>
                    </div>
                  )}
                  {isAnnual && !("priceCustom" in plan && plan.priceCustom) && !isFree && (
                    <p className="text-xs text-emerald-600 font-semibold mt-1">billed annually · save 20%</p>
                  )}
                </div>

                {/* CTA Button */}
                {isEnterprise ? (
                  <a
                    href="mailto:sales@visionboard.app"
                    className="block w-full py-2.5 px-4 text-xs font-bold rounded-xl text-center border border-blue-600 text-blue-600 hover:bg-blue-50/80 active:scale-[0.99] transition-all duration-150"
                  >
                    {plan.ctaText}
                  </a>
                ) : workspaceId && !isFree ? (
                  <button
                    type="button"
                    onClick={() => handleCheckout(plan.tier as PaidTier)}
                    disabled={isLoading || Boolean(loadingTier)}
                    className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                      plan.ctaVariant === "solid"
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-[0.99]"
                        : "border border-blue-600 text-blue-600 hover:bg-blue-50/80 active:scale-[0.99]"
                    }`}
                  >
                    {isLoading && <Loader2 size={12} className="animate-spin" />}
                    {isLoading ? "Redirecting…" : plan.ctaText}
                  </button>
                ) : (
                  <Link
                    href={isFree ? "/auth/register" : `/auth/register?plan=${plan.tier}&period=${isAnnual ? "annual" : "monthly"}`}
                    className={`block w-full py-2.5 px-4 text-xs font-bold rounded-xl text-center cursor-pointer transition-all duration-150 ${
                      plan.ctaVariant === "solid"
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-[0.99]"
                        : "border border-blue-600 text-blue-600 hover:bg-blue-50/80 active:scale-[0.99]"
                    }`}
                  >
                    {plan.ctaText}
                  </Link>
                )}

                {/* Divider */}
                <hr className="my-6 border-slate-100" />

                {/* Feature List */}
                <ul className="space-y-3 text-xs md:text-sm text-slate-700">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
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

      <p className="text-center text-xs text-slate-500 mt-6">
        All paid plans include a 14-day free trial. No credit card required to start.
        Cancel anytime from your workspace settings.
      </p>
    </section>
  );
}
