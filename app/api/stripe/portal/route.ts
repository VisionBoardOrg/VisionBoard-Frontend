/**
 * POST /api/stripe/portal
 *
 * Creates a Stripe Billing Portal session so workspace owners can manage their
 * subscription (upgrade, downgrade, cancel, update payment method).
 *
 * Body: { workspaceId }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { z } from "zod";

const schema = z.object({
  workspaceId: z.string().min(1),
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

  const { workspaceId } = parsed.data;

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
      { error: "Only workspace admins can manage billing." },
      { status: 403 }
    );
  }

  const { stripeCustomerId } = member.workspace;
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe to a plan first." },
      { status: 400 }
    );
  }

  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   stripeCustomerId,
    return_url: `${appUrl}/workspace/${workspaceId}/settings`,
  });

  return NextResponse.json({ url: portalSession.url });
}
