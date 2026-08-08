/**
 * lib/billing-email.ts
 *
 * Transactional billing emails sent via Resend:
 *   - Payment confirmation (subscription activated / renewed)
 *   - Payment failure dunning notice
 *
 * Both functions degrade gracefully to a console log when RESEND_API_KEY
 * is not configured (e.g. local development).
 */

import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "VisionBoard <onboarding@resend.dev>";

// ── Shared HTML shell ─────────────────────────────────────────────────────────

function emailShell(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; color: #0f172a;">
  <div style="max-width: 520px; margin: 40px auto; background: #fff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.07);">
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 28px 32px; text-align: center;">
      <h1 style="margin: 0; color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -0.025em;">VisionBoard</h1>
    </div>
    <div style="padding: 32px; line-height: 1.6;">
      ${body}
    </div>
    <div style="background: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
      &copy; 2026 VisionBoard Inc. All rights reserved.<br>
      Questions? <a href="mailto:billing@visionboard.app" style="color: #2563eb; text-decoration: none;">billing@visionboard.app</a>
    </div>
  </div>
</body>
</html>`;
}

// ── Dispatch helper ───────────────────────────────────────────────────────────

async function dispatch(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (key) {
    try {
      const resend = new Resend(key);
      const result = await resend.emails.send({ from: FROM, to, subject, html });
      if (result.error) {
        console.error("[billing-email] Resend error:", result.error);
      } else {
        console.log(`[billing-email] Sent "${subject}" to ${to} (id=${result.data?.id})`);
      }
    } catch (err) {
      console.error("[billing-email] Exception dispatching email:", err);
    }
  } else {
    console.log(`[billing-email][DEV] Subject: "${subject}" → ${to} (configure RESEND_API_KEY to send real emails)`);
  }
}

// ── Payment confirmation ──────────────────────────────────────────────────────

interface PaymentConfirmationArgs {
  to:          string;
  planLabel:   string;       // e.g. "Startup"
  amount:      string;       // e.g. "$29.00"
  periodEnd:   string;       // e.g. "September 8, 2026"
  invoiceUrl?: string | null;
}

export async function sendPaymentConfirmationEmail({
  to,
  planLabel,
  amount,
  periodEnd,
  invoiceUrl,
}: PaymentConfirmationArgs): Promise<void> {
  const subject = `Payment confirmed — VisionBoard ${planLabel} plan`;

  const body = `
    <h2 style="margin-top: 0; color: #0f172a; font-size: 20px;">Payment confirmed ✓</h2>
    <p style="color: #475569;">Your VisionBoard subscription has been renewed successfully. Here's a summary:</p>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Plan</td>
        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${planLabel}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Amount charged</td>
        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${amount}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #64748b; font-weight: 500;">Next renewal</td>
        <td style="padding: 10px 0; color: #0f172a; font-weight: 700; text-align: right;">${periodEnd}</td>
      </tr>
    </table>

    ${invoiceUrl ? `
    <div style="text-align: center; margin: 24px 0;">
      <a href="${invoiceUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
        View Invoice →
      </a>
    </div>` : ""}

    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
      To manage your subscription or update your payment method, visit your
      <a href="${process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "https://visionboard.app"}" style="color: #2563eb; text-decoration: none;">workspace billing settings</a>.
    </p>
  `;

  await dispatch(to, subject, emailShell(body));
}

// ── Payment failure dunning ───────────────────────────────────────────────────

interface PaymentFailureArgs {
  to:             string;
  planLabel:      string;
  amount:         string;
  invoiceUrl?:    string | null;
  updateCardUrl?: string | null;  // Stripe Billing Portal URL (requires server-side generation)
}

export async function sendPaymentFailureEmail({
  to,
  planLabel,
  amount,
  invoiceUrl,
  updateCardUrl,
}: PaymentFailureArgs): Promise<void> {
  const subject = `Action required: payment failed for your VisionBoard subscription`;

  const appUrl = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? "https://visionboard.app";

  const body = `
    <h2 style="margin-top: 0; color: #dc2626; font-size: 20px;">Payment failed ⚠</h2>
    <p style="color: #475569;">
      We were unable to charge your payment method for your VisionBoard <strong>${planLabel}</strong> subscription
      (${amount}). Your workspace access is currently unaffected, but we'll need to resolve this soon to
      keep your subscription active.
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #991b1b; font-weight: 600;">What to do next:</p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; color: #7f1d1d; line-height: 1.7;">
        <li>Check that your card details are up to date.</li>
        <li>Ensure your card has sufficient funds or no spending restrictions on SaaS services.</li>
        <li>Contact your bank if the charge was declined.</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 24px 0; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
      <a href="${updateCardUrl ?? appUrl}" style="display: inline-block; background: #dc2626; color: #fff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px;">
        Update Payment Method →
      </a>
      ${invoiceUrl ? `<a href="${invoiceUrl}" style="display: inline-block; background: #f1f5f9; color: #0f172a; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px; border: 1px solid #e2e8f0;">View Invoice</a>` : ""}
    </div>

    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">
      If you continue to experience issues, reply to this email or contact us at
      <a href="mailto:billing@visionboard.app" style="color: #2563eb; text-decoration: none;">billing@visionboard.app</a>.
      Stripe may attempt to retry the charge automatically over the next few days.
    </p>
  `;

  await dispatch(to, subject, emailShell(body));
}
