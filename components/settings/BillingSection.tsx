"use client";

/**
 * BillingSection — Plan & Billing panel inside workspace settings.
 *
 * Shows the current plan, key limits, renewal / cancellation info, and
 * action buttons to upgrade (→ Stripe Checkout) or manage (→ Billing Portal).
 *
 * Reads `?checkout=success` and `?checkout=cancelled` query params to show
 * inline feedback after returning from Stripe Checkout.
 */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Zap, CheckCircle2, AlertCircle, Loader2, ExternalLink, X } from "lucide-react";
import { PlanTier } from "@prisma/client";
import { PLAN_LIMITS } from "@/lib/plan-limits";

// ── Types ─────────────────────────────────────────────────────────────────────

type BillingPeriod = "monthly" | "annual";
type PaidTier = "startup" | "growth" | "enterprise";

interface BillingSectionProps {
  workspaceId?: string;
  plan: PlanTier;
  limits: (typeof PLAN_LIMITS)[PlanTier];
  isOwnerOrAdmin?: boolean;
  stripeCustomerId: string | null;
  stripeCurrentPeriodEnd: string | null; // ISO string
  stripeCancelAtPeriodEnd: boolean;
  aiCreditsUsed?: number;
}

// ── Static plan display data ──────────────────────────────────────────────────

const TIER_META: Record<
  PlanTier,
  { label: string; badgeClass: string; color: string }
> = {
  free: { label: "Free", badgeClass: "bg-slate-100 text-slate-700", color: "text-slate-700" },
  startup: { label: "Startup", badgeClass: "bg-cyan-50 text-cyan-700 border border-cyan-200", color: "text-cyan-700" },
  growth: { label: "Growth", badgeClass: "bg-blue-faint text-blue border border-blue-light", color: "text-blue" },
  enterprise: { label: "Enterprise", badgeClass: "bg-violet-50 text-violet-700 border border-violet-200", color: "text-violet-700" },
};

const UPGRADE_PLANS: {
  tier: PaidTier;
  label: string;
  monthlyPrice: string;
  annualPrice: string;
  highlights: string[];
  recommended?: boolean;
}[] = [
    {
      tier: "startup",
      label: "Startup",
      monthlyPrice: "$29",
      annualPrice: "$23",
      highlights: ["5 workspaces", "25 members", "100 AI credits/mo", "Timeline & sprints"],
      recommended: true,
    },
    {
      tier: "growth",
      label: "Growth",
      monthlyPrice: "$79",
      annualPrice: "$63",
      highlights: ["Unlimited workspaces", "100 members", "Unlimited AI credits", "Integrations"],
    },
    {
      tier: "enterprise",
      label: "Enterprise",
      monthlyPrice: "Custom",
      annualPrice: "Custom",
      highlights: ["Unlimited everything", "SSO / SAML", "Dedicated support", "Custom SLA"],
    },
  ];

// ── Component ─────────────────────────────────────────────────────────────────

export function BillingSection({
  workspaceId,
  plan,
  limits,
  isOwnerOrAdmin = true,
  stripeCustomerId,
  stripeCurrentPeriodEnd,
  stripeCancelAtPeriodEnd,
}: BillingSectionProps) {
  const searchParams = useSearchParams();

  // ── Post-checkout banner ─────────────────────────────────────────────────
  const checkoutParam = searchParams.get("checkout");
  const [dismissedBanner, setDismissedBanner] = useState(false);
  const banner = !dismissedBanner && (checkoutParam === "success" || checkoutParam === "cancelled")
    ? checkoutParam
    : null;

  // ── Upgrade panel state ──────────────────────────────────────────────────
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const [loadingTier, setLoadingTier] = useState<PaidTier | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const meta = TIER_META[plan];
  const isOnPaid = plan !== "free";
  const hasStripe = Boolean(stripeCustomerId);

  // ── Format renewal / cancellation date ──────────────────────────────────
  const periodEndLabel = stripeCurrentPeriodEnd
    ? new Date(stripeCurrentPeriodEnd).toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    })
    : null;

  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleUpgrade(tier: PaidTier) {
    setError("");
    setLoadingTier(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, tier, period }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start checkout. Please try again.");
        return;
      }
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoadingTier(null);
    }
  }

  async function handlePortal() {
    setError("");
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not open billing portal. Please try again.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setPortalLoading(false);
    }
  }

  // ── Limit display helpers ────────────────────────────────────────────────
  const fmt = (v: number | null) =>
    v === null || v === -1 ? "Unlimited" : v.toString();

  return (
    <section className="bg-white rounded-2xl border border-border p-6">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-5">
        <CreditCard size={18} className="text-blue" />
        <h2 className="font-semibold text-ink">Plan &amp; Billing</h2>
        <span className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${meta.badgeClass}`}>
          {meta.label}
        </span>
      </div>

      {/* ── Post-checkout banners ── */}
      {banner === "success" && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
          <div className="flex-1">
            <strong>Subscription activated!</strong> Your workspace has been upgraded. It may take a
            moment for changes to reflect.
          </div>
          <button onClick={() => setDismissedBanner(true)} className="ml-2 text-emerald-600 hover:text-emerald-800">
            <X size={14} />
          </button>
        </div>
      )}
      {banner === "cancelled" && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="flex-1">Checkout was cancelled — your plan has not changed.</div>
          <button onClick={() => setDismissedBanner(true)} className="ml-2 text-amber-600 hover:text-amber-800">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError("")} className="ml-2 text-red-400 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Current plan summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Workspaces", value: fmt(limits.workspaces) },
          { label: "Members", value: fmt(limits.members) },
          { label: "AI Credits", value: fmt(limits.aiCreditsPerMonth) + (limits.aiCreditsPerMonth !== null && limits.aiCreditsPerMonth !== -1 ? "/mo" : "") },
          { label: "Storage", value: limits.storageMb === null || limits.storageMb === -1 ? "Unlimited" : `${limits.storageMb} MB` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-offwhite rounded-xl p-3 text-center">
            <div className="text-[11px] text-muted font-medium uppercase tracking-wide">{label}</div>
            <div className={`text-base font-bold mt-0.5 ${meta.color}`}>{value}</div>
          </div>
        ))}
      </div>

      {/* ── Features on current plan ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {limits.timelineGantt && (
          <FeatureChip label="Timeline & Gantt" />
        )}
        {limits.sprintTracking && (
          <FeatureChip label="Sprint Tracking" />
        )}
        {limits.integrations && (
          <FeatureChip label="Integrations" />
        )}
        {limits.sso && (
          <FeatureChip label="SSO / SAML" />
        )}
        {limits.activityLogDays === -1 ? (
          <FeatureChip label="Unlimited Activity Log" />
        ) : (
          <FeatureChip label={`${limits.activityLogDays}-day Activity Log`} muted />
        )}
      </div>

      {/* ── Renewal / cancellation info ── */}
      {isOnPaid && periodEndLabel && (
        <p className="text-xs text-muted mb-5">
          {stripeCancelAtPeriodEnd ? (
            <>
              <span className="text-amber-600 font-medium">Cancels on {periodEndLabel}.</span>
              {" "}Your workspace will revert to the Free plan after that date.
            </>
          ) : (
            <>Renews on <strong className="text-ink">{periodEndLabel}</strong>.</>
          )}
        </p>
      )}

      {/* ── Action buttons (admin/owner only) ── */}
      {isOwnerOrAdmin && (
        <div className="flex flex-wrap gap-3">
          {/* Manage existing subscription */}
          {hasStripe && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-border text-ink hover:bg-offwhite transition-colors disabled:opacity-50"
            >
              {portalLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ExternalLink size={14} />
              )}
              {portalLoading ? "Opening portal…" : "Manage Subscription"}
            </button>
          )}

          {/* Upgrade / change plan */}
          {plan !== "enterprise" && (
            <button
              onClick={() => { setShowUpgrade((v) => !v); setError(""); }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-blue text-white hover:bg-blue-mid transition-colors"
            >
              <Zap size={14} />
              {isOnPaid ? "Change Plan" : "Upgrade Plan"}
            </button>
          )}
        </div>
      )}

      {/* ── Non-admin notice ── */}
      {!isOwnerOrAdmin && (
        <p className="text-xs text-muted">Only workspace owners and admins can manage billing.</p>
      )}

      {/* ── Upgrade plan picker ── */}
      {showUpgrade && isOwnerOrAdmin && (
        <div className="mt-6 pt-5 border-t border-border">
          {/* Billing period toggle */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">Choose a plan</h3>
            <div className="flex items-center gap-1 bg-offwhite rounded-xl p-1 text-xs font-medium">
              <button
                onClick={() => setPeriod("monthly")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${period === "monthly" ? "bg-white text-ink shadow-sm border border-border" : "text-muted hover:text-ink"
                  }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setPeriod("annual")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${period === "annual" ? "bg-white text-ink shadow-sm border border-border" : "text-muted hover:text-ink"
                  }`}
              >
                Annual
                <span className="ml-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                  −20%
                </span>
              </button>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {UPGRADE_PLANS.map(({ tier, label, monthlyPrice, annualPrice, highlights, recommended }) => {
              const isCurrent = plan === tier;
              const isLoading = loadingTier === tier;
              const price = period === "annual" ? annualPrice : monthlyPrice;
              const isCustom = price === "Custom";

              return (
                <div
                  key={tier}
                  className={`relative rounded-xl border p-4 flex flex-col gap-3 ${recommended && !isCurrent
                      ? "border-blue ring-2 ring-blue/20"
                      : isCurrent
                        ? "border-emerald-300 bg-emerald-50/50"
                        : "border-border"
                    }`}
                >
                  {recommended && !isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                      Recommended
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">
                      Current
                    </span>
                  )}

                  <div>
                    <div className="font-bold text-ink text-sm">{label}</div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-extrabold text-ink">{price}</span>
                      {!isCustom && (
                        <span className="text-xs text-muted">/mo</span>
                      )}
                    </div>
                    {period === "annual" && !isCustom && (
                      <div className="text-[11px] text-muted mt-0.5">billed annually</div>
                    )}
                  </div>

                  <ul className="space-y-1.5 text-[11px] text-slate flex-1">
                    {highlights.map((h) => (
                      <li key={h} className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-blue shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => isCustom ? window.open("mailto:sales@vision-board.tech") : handleUpgrade(tier)}
                    disabled={isCurrent || isLoading || Boolean(loadingTier)}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${isCurrent
                        ? "bg-emerald-100 text-emerald-700 cursor-default"
                        : recommended
                          ? "bg-blue text-white hover:bg-blue-mid disabled:opacity-50"
                          : "border border-border text-ink hover:bg-offwhite disabled:opacity-50"
                      }`}
                  >
                    {isLoading && <Loader2 size={12} className="animate-spin" />}
                    {isCurrent
                      ? "Current plan"
                      : isCustom
                        ? "Contact Sales"
                        : isLoading
                          ? "Redirecting…"
                          : isOnPaid
                            ? `Switch to ${label}`
                            : `Upgrade to ${label}`}
                  </button>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-muted text-center">
            You&apos;ll be redirected to Stripe&apos;s secure checkout. Subscriptions can be cancelled anytime.
          </p>
        </div>
      )}
    </section>
  );
}

// ── Small helper chip ─────────────────────────────────────────────────────────

function FeatureChip({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${muted
          ? "bg-offwhite text-muted border-border"
          : "bg-blue-faint text-blue border-blue-light"
        }`}
    >
      {label}
    </span>
  );
}
