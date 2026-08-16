/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for upgrading a user account to a paid plan.
 * Redirects the user to Stripe-hosted checkout on success.
 *
 * Body: { tier, period, workspaceId?, returnUrl? }
 *  - tier: "startup" | "growth" | "enterprise"
 *  - period: "monthly" | "annual"
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, getPriceId, BillingPeriod, PaidTier } from "@/lib/stripe";
import { z } from "zod";

const schema = z.object({
  workspaceId: z.string().optional(),
  returnUrl:   z.string().optional(),
  tier:        z.enum(["startup", "growth", "enterprise"]),
  period:      z.enum(["monthly", "annual"]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body   = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, returnUrl, tier, period } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, stripeCustomerId: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Look up or create Stripe customer for this user
  let stripeCustomerId = user.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email:    user.email ?? undefined,
      name:     user.name  ?? undefined,
      metadata: { userId: session.user.id },
    });

    stripeCustomerId = customer.id;

    await prisma.user.update({
      where: { id: session.user.id },
      data:  { stripeCustomerId },
    });
  }

  let priceId: string;
  try {
    priceId = getPriceId(tier as PaidTier, period as BillingPeriod);
  } catch {
    return NextResponse.json(
      { error: "Pricing not configured for that plan. Please contact support." },
      { status: 503 }
    );
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const successUrl = returnUrl
    ? `${returnUrl}?checkout=success`
    : workspaceId
      ? `${appUrl}/workspace/${workspaceId}/settings?checkout=success`
      : `${appUrl}/account?checkout=success`;

  const cancelUrl = returnUrl
    ? `${returnUrl}?checkout=cancelled`
    : workspaceId
      ? `${appUrl}/workspace/${workspaceId}/settings?checkout=cancelled`
      : `${appUrl}/account?checkout=cancelled`;

  const checkoutSession = await stripe.checkout.sessions.create({
    customer:            stripeCustomerId,
    mode:                "subscription",
    line_items:          [{ price: priceId, quantity: 1 }],
    success_url:         successUrl,
    cancel_url:          cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: session.user.id },
    },
    metadata: { userId: session.user.id },
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
