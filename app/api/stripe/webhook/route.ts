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
import { sendPaymentConfirmationEmail, sendPaymentFailureEmail } from "@/lib/billing-email";
import { dispatchBillingNotification } from "@/lib/notifications";
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

        const userId = checkoutSession.metadata?.userId;
        const customer = checkoutSession.customer as string;

        let targetUserId = userId;
        if (!targetUserId && customer) {
          const user = await prisma.user.findUnique({
            where: { stripeCustomerId: customer },
            select: { id: true },
          });
          targetUserId = user?.id;
        }

        if (!targetUserId) {
          console.warn("[stripe/webhook] checkout.session.completed missing user identifier");
          break;
        }

        const subscriptionId = checkoutSession.subscription as string;
        const subscription   = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(targetUserId, subscription);
        break;
      }

      // ── Subscription updated (upgrade, downgrade, renewal) ────────────────
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId  = subscription.metadata?.userId;
        if (!userId) {
          // Fallback: look up user by customer ID
          const customer = subscription.customer as string;
          const user = await prisma.user.findUnique({
            where: { stripeCustomerId: customer },
            select: { id: true },
          });
          if (!user) {
            console.warn("[stripe/webhook] subscription.updated: no user for customer", customer);
            break;
          }
          await syncSubscription(user.id, subscription);
          break;
        }
        await syncSubscription(userId, subscription);
        break;
      }

      // ── Subscription cancelled/deleted ────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer     = subscription.customer as string;

        const user = await prisma.user.findUnique({
          where: { stripeCustomerId: customer },
        });
        if (!user) {
          console.warn("[stripe/webhook] subscription.deleted: no user for customer", customer);
          break;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan:                       "free",
            stripeSubscriptionId:       null,
            stripePriceId:              null,
            stripeCurrentPeriodEnd:     null,
            stripeCancelAtPeriodEnd:    false,
          },
        });

        console.log(`[stripe/webhook] User ${user.id} downgraded to free (subscription deleted)`);
        break;
      }

      // ── Invoice paid → reset monthly AI credits + send confirmation email ──
      case "invoice.payment_succeeded": {
        const invoice       = event.data.object as Stripe.Invoice;
        const customer      = invoice.customer as string;
        const billingReason = (invoice as Stripe.Invoice & { billing_reason?: string }).billing_reason;

        const user = await prisma.user.findUnique({
          where: { stripeCustomerId: customer },
          select: { id: true, email: true, name: true, plan: true, stripeCurrentPeriodEnd: true },
        });
        if (!user) break;

        // Only reset credits on subscription cycle renewals, not the first payment
        if (billingReason === "subscription_cycle") {
          await prisma.user.update({
            where: { id: user.id },
            data:  { aiCreditsUsed: 0 },
          });
          console.log(`[stripe/webhook] AI credits reset for user ${user.id} (renewal)`);
        }

        // Send billing confirmation email to the user
        const planLabel = user.plan.charAt(0).toUpperCase() + user.plan.slice(1);
        const amountPaid = invoice.amount_paid
          ? `$${(invoice.amount_paid / 100).toFixed(2)}`
          : "—";
        const periodEnd = user.stripeCurrentPeriodEnd
          ? user.stripeCurrentPeriodEnd.toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })
          : "—";

        await sendPaymentConfirmationEmail({
          to:         user.email,
          planLabel,
          amount:     amountPaid,
          periodEnd,
          invoiceUrl: invoice.hosted_invoice_url ?? null,
        });

        break;
      }

      // ── Payment failed — send dunning email ───────────────────────────────
      case "invoice.payment_failed": {
        const invoice  = event.data.object as Stripe.Invoice;
        const customer = invoice.customer as string;
        console.warn("[stripe/webhook] Payment failed for Stripe customer:", customer);

        const user = await prisma.user.findUnique({
          where: { stripeCustomerId: customer },
          select: { id: true, email: true, plan: true },
        });
        if (!user) break;

        const planLabelFailed = user.plan.charAt(0).toUpperCase() + user.plan.slice(1);
        const amountDue = invoice.amount_due
          ? `$${(invoice.amount_due / 100).toFixed(2)}`
          : "—";

        await sendPaymentFailureEmail({
          to:         user.email,
          planLabel:  planLabelFailed,
          amount:     amountDue,
          invoiceUrl: invoice.hosted_invoice_url ?? null,
        });

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
  userId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const item       = subscription.items.data[0];
  const priceId    = item?.price?.id ?? null;
  const plan       = planFromPriceId(priceId);
  const periodEnd  = new Date(subscription.current_period_end * 1000);
  const cancelFlag = subscription.cancel_at_period_end;

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan:                       plan as "free" | "startup" | "growth" | "enterprise",
      stripeSubscriptionId:       subscription.id,
      stripePriceId:              priceId,
      stripeCurrentPeriodEnd:     periodEnd,
      stripeCancelAtPeriodEnd:    cancelFlag,
    },
  });

  console.log(
    `[stripe/webhook] User ${userId} → plan=${plan}, ` +
    `sub=${subscription.id}, periodEnd=${periodEnd.toISOString()}, cancel=${cancelFlag}`,
  );
}
