/**
 * POST /api/stripe/webhook
 *
 * Stripe sends signed webhook events here. We verify the signature with the
 * webhook secret, then update workspace billing state accordingly.
 *
 * IMPORTANT: This route must be excluded from NextAuth middleware (see proxy.ts)
 * and must receive the raw request body — no JSON body parsing middleware.
 *
 * Handled events:
 *   checkout.session.completed          → record subscription on workspace
 *   customer.subscription.updated       → sync plan, period, cancel flag
 *   customer.subscription.deleted       → downgrade to free
 *   invoice.payment_succeeded           → reset aiCreditsUsed on renewal cycle
 *   invoice.payment_failed              → (logged, could send email)
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";


export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Read raw body as text for signature verification
  const rawBody = await request.text();
  const sig     = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe/webhook] Signature verification failed:", msg);
    return NextResponse.json({ error: `Webhook signature error: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed ────────────────────────────────────────────────
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        if (checkoutSession.mode !== "subscription") break;

        const workspaceId = checkoutSession.metadata?.workspaceId;
        if (!workspaceId) {
          console.warn("[stripe/webhook] checkout.session.completed missing workspaceId metadata");
          break;
        }

        const subscriptionId = checkoutSession.subscription as string;
        const subscription   = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(workspaceId, subscription);
        break;
      }

      // ── Subscription updated (upgrade, downgrade, renewal) ────────────────
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const workspaceId  = subscription.metadata?.workspaceId;
        if (!workspaceId) {
          // Fallback: look up workspace by customer ID
          const customer = subscription.customer as string;
          const workspace = await prisma.workspace.findUnique({
            where: { stripeCustomerId: customer },
          });
          if (!workspace) {
            console.warn("[stripe/webhook] subscription.updated: no workspace for customer", customer);
            break;
          }
          await syncSubscription(workspace.id, subscription);
          break;
        }
        await syncSubscription(workspaceId, subscription);
        break;
      }

      // ── Subscription cancelled/deleted ────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer     = subscription.customer as string;

        const workspace = await prisma.workspace.findUnique({
          where: { stripeCustomerId: customer },
        });
        if (!workspace) {
          console.warn("[stripe/webhook] subscription.deleted: no workspace for customer", customer);
          break;
        }

        await prisma.workspace.update({
          where: { id: workspace.id },
          data: {
            plan:                       "free",
            stripeSubscriptionId:       null,
            stripePriceId:              null,
            stripeCurrentPeriodEnd:     null,
            stripeCancelAtPeriodEnd:    false,
          },
        });

        console.log(`[stripe/webhook] Workspace ${workspace.id} downgraded to free (subscription deleted)`);
        break;
      }

      // ── Invoice paid → reset monthly AI credits ──────────────────────────
      case "invoice.payment_succeeded": {
        const invoice      = event.data.object as Stripe.Invoice;
        const customer     = invoice.customer as string;
        // Only reset on subscription renewals, not the first payment
        // (billing_reason: "subscription_cycle" | "subscription_create" | "manual" | etc.)
        const billingReason = (invoice as Stripe.Invoice & { billing_reason?: string }).billing_reason;
        if (billingReason !== "subscription_cycle") break;

        const workspace = await prisma.workspace.findUnique({
          where: { stripeCustomerId: customer },
        });
        if (!workspace) break;

        await prisma.workspace.update({
          where: { id: workspace.id },
          data:  { aiCreditsUsed: 0 },
        });

        console.log(`[stripe/webhook] AI credits reset for workspace ${workspace.id} (renewal)`);
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice  = event.data.object as Stripe.Invoice;
        const customer = invoice.customer as string;
        console.warn("[stripe/webhook] Payment failed for Stripe customer:", customer);
        // TODO: send a dunning email via Resend
        break;
      }

      default:
        // Unhandled events — acknowledge receipt so Stripe doesn't retry
        break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[stripe/webhook] Error handling event ${event.type}:`, msg);
    return NextResponse.json({ error: "Internal webhook handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function syncSubscription(
  workspaceId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item       = subscription.items.data[0];
  const priceId    = item?.price?.id ?? null;
  const plan       = planFromPriceId(priceId);
  const periodEnd  = new Date(subscription.current_period_end * 1000);
  const cancelFlag = subscription.cancel_at_period_end;

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      plan:                       plan as "free" | "startup" | "growth" | "enterprise",
      stripeSubscriptionId:       subscription.id,
      stripePriceId:              priceId,
      stripeCurrentPeriodEnd:     periodEnd,
      stripeCancelAtPeriodEnd:    cancelFlag,
    },
  });

  console.log(
    `[stripe/webhook] Workspace ${workspaceId} → plan=${plan}, ` +
    `sub=${subscription.id}, periodEnd=${periodEnd.toISOString()}, cancel=${cancelFlag}`,
  );
}
