"use client";

/**
 * PricingCards — public pricing page plan grid.
 *
 * For authenticated users the upgrade buttons call /api/stripe/checkout directly
 * and redirect to Stripe, while their active tier shows "Current Plan" / "Manage Billing".
 *
 * For unauthenticated visitors the buttons link to /auth/register so they
 * can create an account first.
 */

import { useState } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2 } from "lucide-react";

interface PricingCardsProps {
  isAnnual: boolean;
  /** Whether the visitor is signed in */
  isAuthenticated?: boolean;
  /** Optional primary owned workspace ID for authenticated in-app upgrades */
  workspaceId?: string;
  /** User's currently active plan tier ("free" | "startup" | "growth" | "enterprise") */
  currentPlan?: string;
}

type PaidTier = "startup" | "growth" | "enterprise";

const plans = [
  {
    name: "Free",
    planKey: "free",
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
      "5 MB document storage (up to 10 docs)",
      "10 AI credits / month",
      "Standard roadmap views & filtering",
      "7-day activity log",
      "Community support",
    ],
  },
  {
    name: "Startup",
    planKey: "startup",
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
      "100 MB document storage (up to 100 docs)",
      "100 AI credits / month",
      "Full roadmap, board & timeline/Gantt views",
      "Role-based permissions & 30-day activity log",
      "Email support",
    ],
  },
  {
    name: "Growth",
    planKey: "growth",
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
      "1 GB document storage (unlimited docs)",
      "Unlimited AI credits",
      "Integrations & AI goal deconstructor",
      "Extended 90-day activity history",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    planKey: "enterprise",
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
      "Unlimited activity log history",
      "SSO / SAML & advanced security controls",
      "Dedicated account manager & SLA",
    ],
  },
] as const;

export default function PricingCards({
  isAnnual,
  isAuthenticated = false,
  workspaceId,
  currentPlan,
}: PricingCardsProps) {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleCheckout(tier: PaidTier) {
    setError("");
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(workspaceId ? { workspaceId } : {}),
          tier,
          period: isAnnual ? "annual" : "monthly",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout. Please try again.");
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoadingTier(null);
    }
  }

  async function handleManageBilling(key: string) {
    setError("");
    setLoadingTier(key);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(workspaceId ? { workspaceId } : {}),
          returnUrl: "/pricing",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Fallback to account settings if Stripe portal is not yet set up
        window.location.assign(workspaceId ? `/workspace/${workspaceId}/settings` : "/account");
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoadingTier(null);
    }
  }

  const normalizedCurrentPlan = currentPlan?.toLowerCase();

  return (
    <section className="py-8 px-4 max-w-7xl mx-auto" aria-label="Subscription plans">
      {error && (
        <div
          role="alert"
          className="mb-6 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-xl mx-auto"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {plans.map((plan) => {
          const isPopular = plan.popular;
          const displayPrice =
            "priceCustom" in plan && plan.priceCustom
              ? plan.priceCustom
              : isAnnual
                ? (plan as { priceAnnual?: string }).priceAnnual
                : (plan as { priceMonthly?: string }).priceMonthly;

          const isEnterprise = plan.tier === "enterprise";
          const isFree = plan.tier === null;
          const isCurrentPlan = isAuthenticated && normalizedCurrentPlan === plan.planKey;
          const actionKey = plan.planKey;
          const isLoading = loadingTier === actionKey;

          const solidClass =
            "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 active:scale-[0.99]";
          const outlineClass =
            "border border-blue-600 text-blue-600 hover:bg-blue-50/80 active:scale-[0.99]";

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
                  <span className="bg-blue-600 text-white font-semibold text-[11px] uppercase tracking-wider px-3.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                    Most Popular
                  </span>
                </div>
              )}

              <div>
                {/* Header */}
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{plan.name}</h2>
                  {isCurrentPlan && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                      Current Plan
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 min-h-[36px] leading-relaxed">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mt-5 mb-6" aria-live="polite" aria-atomic="true">
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
                      <span className="text-sm font-medium text-slate-500">
                        {"period" in plan ? plan.period : ""}
                      </span>
                    </div>
                  )}
                  {isAnnual && !("priceCustom" in plan && plan.priceCustom) && !isFree && (
                    <p className="text-xs text-emerald-700 font-semibold mt-1">
                      billed annually · save 20%
                    </p>
                  )}
                </div>

                {/* CTA Button */}
                {isEnterprise ? (
                  isCurrentPlan ? (
                    <button
                      type="button"
                      onClick={() => handleManageBilling(actionKey)}
                      disabled={Boolean(loadingTier)}
                      className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-60 ${outlineClass}`}
                    >
                      {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      {isLoading ? "Opening portal…" : "Manage Billing"}
                    </button>
                  ) : (
                    <a
                      href="mailto:sales@vision-board.tech"
                      className={`block w-full py-2.5 px-4 text-xs font-bold rounded-xl text-center transition-all duration-150 ${outlineClass}`}
                    >
                      {plan.ctaText}
                    </a>
                  )
                ) : isAuthenticated ? (
                  isCurrentPlan ? (
                    isFree ? (
                      <Link
                        href="/dashboard"
                        className="block w-full py-2.5 px-4 text-xs font-bold rounded-xl text-center bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                      >
                        Current Plan · Go to Dashboard
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleManageBilling(actionKey)}
                        disabled={Boolean(loadingTier)}
                        className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-60 ${outlineClass}`}
                      >
                        {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                        {isLoading ? "Opening portal…" : "Manage Billing"}
                      </button>
                    )
                  ) : isFree ? (
                    <button
                      type="button"
                      onClick={() => handleManageBilling(actionKey)}
                      disabled={Boolean(loadingTier)}
                      className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-60 ${outlineClass}`}
                    >
                      {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      {isLoading ? "Opening portal…" : "Manage Billing"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.tier as PaidTier)}
                      disabled={isLoading || Boolean(loadingTier)}
                      className={`w-full py-2.5 px-4 text-xs font-bold rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                        plan.ctaVariant === "solid" ? solidClass : outlineClass
                      }`}
                    >
                      {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      {isLoading ? "Redirecting…" : `Upgrade to ${plan.name}`}
                    </button>
                  )
                ) : (
                  <Link
                    href={
                      isFree
                        ? "/auth/register"
                        : `/auth/register?plan=${plan.tier}&period=${isAnnual ? "annual" : "monthly"}`
                    }
                    className={`block w-full py-2.5 px-4 text-xs font-bold rounded-xl text-center cursor-pointer transition-all duration-150 ${
                      plan.ctaVariant === "solid" ? solidClass : outlineClass
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
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
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

      <p className="text-center text-xs text-slate-600 mt-6">
        All paid plans include a 14-day free trial. No credit card required to start.
        Cancel anytime from your workspace settings.
      </p>
    </section>
  );
}
