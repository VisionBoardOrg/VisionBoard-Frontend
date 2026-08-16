/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session so users can manage their
 * subscription (upgrade, downgrade, cancel, update payment method).
 *
 * Body: { workspaceId?, returnUrl? }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getSafeCallbackUrl } from "@/lib/safe-redirect";
import { z } from "zod";

const schema = z.object({
  workspaceId: z.string().optional(),
  returnUrl:   z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body   = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { workspaceId, returnUrl } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe to a plan first." },
      { status: 400 }
    );
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const safeReturn = returnUrl && typeof returnUrl === "string" ? getSafeCallbackUrl(returnUrl, "") : "";

  const targetReturnUrl = safeReturn
    ? `${appUrl}${safeReturn}`
    : workspaceId
      ? `${appUrl}/workspace/${workspaceId}/settings`
      : `${appUrl}/account`;

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   user.stripeCustomerId,
    return_url: targetReturnUrl,
  });

  return NextResponse.json({ url: portalSession.url });
}
