/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for upgrading a workspace to a paid plan.
 * Redirects the user to Stripe-hosted checkout on success.
 *
 * Body: { workspaceId, tier, period }
 *  - workspaceId: string
 *  - tier: "startup" | "growth" | "enterprise"
 *  - period: "monthly" | "annual"
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, getPriceId, BillingPeriod, PaidTier } from "@/lib/stripe";
import { z } from "zod";

const schema = z.object({
  workspaceId: z.string().min(1),
  tier:        z.enum(["startup", "growth", "enterprise"]),
  period:      z.enum(["monthly", "annual"]),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body   = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, tier, period } = parsed.data;

  // Verify the caller is an admin/owner of the workspace
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: session.user.id } },
    include: { workspace: true },
  });

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isOwnerOrAdmin =
    member.workspace.ownerId === session.user.id || member.role === "admin";
  if (!isOwnerOrAdmin) {
    return NextResponse.json(
      { error: "Only workspace admins can change the billing plan." },
      { status: 403 }
    );
  }

  const { workspace } = member;

  // Look up or create Stripe customer for this workspace
  let stripeCustomerId = workspace.stripeCustomerId;

  if (!stripeCustomerId) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, name: true },
    });

    const customer = await stripe.customers.create({
      email:    user?.email ?? undefined,
      name:     user?.name  ?? undefined,
      metadata: { workspaceId, userId: session.user.id },
    });

    stripeCustomerId = customer.id;

    await prisma.workspace.update({
      where: { id: workspaceId },
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

  const checkoutSession = await stripe.checkout.sessions.create({
    customer:            stripeCustomerId,
    mode:                "subscription",
    line_items:          [{ price: priceId, quantity: 1 }],
    success_url:         `${appUrl}/workspace/${workspaceId}/settings?checkout=success`,
    cancel_url:          `${appUrl}/workspace/${workspaceId}/settings?checkout=cancelled`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { workspaceId },
    },
    metadata: { workspaceId },
  });

  if (!checkoutSession.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
