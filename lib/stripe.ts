/**
 * lib/stripe.ts — Stripe SDK singleton (server-side only).
 *
 * Import this wherever you need the Stripe client in Node.js contexts
 * (API routes, server actions). Never import in Edge Middleware.
 *
 * Prices are resolved from environment variables so no price IDs are
 * hard-coded in source. Set them in .env.local for development and in
 * your deployment environment for production.
 */

import Stripe from "stripe";

// Validate the key at module initialisation time.
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey && process.env.NODE_ENV === "production") {
  console.warn(
    "[stripe] WARNING: STRIPE_SECRET_KEY is not set. Stripe API calls will fail at runtime."
  );
}

export const stripe = new Stripe(stripeKey ?? "sk_test_dummy_key_for_build", {
  apiVersion: "2025-02-24.acacia",
  typescript: true,
});

// ── Price ID lookup ──────────────────────────────────────────────────────────

export type BillingPeriod = "monthly" | "annual";
export type PaidTier      = "startup" | "growth" | "enterprise";

const PRICE_ENV_KEYS: Record<PaidTier, Record<BillingPeriod, string>> = {
  startup:    { monthly: "STRIPE_PRICE_STARTUP_MONTHLY",    annual: "STRIPE_PRICE_STARTUP_ANNUAL"    },
  growth:     { monthly: "STRIPE_PRICE_GROWTH_MONTHLY",     annual: "STRIPE_PRICE_GROWTH_ANNUAL"     },
  enterprise: { monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY", annual: "STRIPE_PRICE_ENTERPRISE_ANNUAL" },
};

export function getPriceId(tier: PaidTier, period: BillingPeriod): string {
  const key   = PRICE_ENV_KEYS[tier][period];
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

// ── Plan mapping (Stripe price → PlanTier) ───────────────────────────────────

const PRICE_TO_PLAN: Record<string, string> = {};

/**
 * Build the reverse-lookup map lazily at runtime so missing env vars don't
 * crash the server on startup when Stripe is not fully configured yet.
 */
function getPriceToPlanMap(): Record<string, string> {
  if (Object.keys(PRICE_TO_PLAN).length > 0) return PRICE_TO_PLAN;

  for (const [tier, periods] of Object.entries(PRICE_ENV_KEYS) as [PaidTier, Record<BillingPeriod, string>][]) {
    for (const key of Object.values(periods)) {
      const priceId = process.env[key];
      if (priceId) PRICE_TO_PLAN[priceId] = tier;
    }
  }

  return PRICE_TO_PLAN;
}

/**
 * Map a Stripe price ID back to a PlanTier string.
 * Returns "free" for unknown prices (safe fallback — downgrade rather than
 * accidentally granting a higher tier).
 */
export function planFromPriceId(priceId: string | null | undefined): string {
  if (!priceId) return "free";
  return getPriceToPlanMap()[priceId] ?? "free";
}
