/**
 * POST /api/webhooks/supabase/users
 *
 * Receives Supabase Database Webhook events on the "User" table (INSERT, UPDATE, DELETE)
 * and keeps Resend contacts synchronized in real-time.
 *
 * Setup in Supabase Dashboard:
 * 1. Go to Database -> Webhooks -> Create a new webhook
 * 2. Table: "User" (public schema)
 * 3. Events: INSERT, UPDATE, DELETE
 * 4. HTTP Request: POST https://your-domain.com/api/webhooks/supabase/users
 * 5. HTTP Header: x-supabase-webhook-secret = (your secret matching SUPABASE_WEBHOOK_SECRET)
 *    SECURITY: The secret is accepted VIA HEADER ONLY. Query-string secrets are rejected
 *    to avoid leaking the value into access logs.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncUserToResend, removeUserFromResend } from "@/lib/resend-sync";
import { safeCompare } from "@/lib/auth/safe-compare";

interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: {
    id?: string;
    email?: string;
    name?: string | null;
    scheduledDeletion?: string | null;
  } | null;
  old_record: {
    id?: string;
    email?: string;
    name?: string | null;
  } | null;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET?.trim();

  if (!webhookSecret) {
    console.error(
      "[webhooks/supabase/users] SUPABASE_WEBHOOK_SECRET env var is not set — " +
        "refusing all webhook request. Resend sync is disabled until a secret is configured."
    );
    return NextResponse.json(
      { error: "Webhook not configured — set SUPABASE_WEBHOOK_SECRET before deploying." },
      { status: 500 }
    );
  }

  const incomingSecret = request.headers.get("x-supabase-webhook-secret");
  if (!incomingSecret || !safeCompare(incomingSecret, webhookSecret)) {
    console.warn(
      "[webhooks/supabase/users] Rejected request: missing or wrong x-supabase-webhook-secret header."
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload: SupabaseWebhookPayload = await request.json();
    const { type, record, old_record } = payload;

    switch (type) {
      case "INSERT": {
        if (record?.email) {
          await syncUserToResend({
            id: record.id,
            email: record.email,
            name: record.name,
          });
        }
        break;
      }

      case "UPDATE": {
        if (record?.scheduledDeletion) {
          if (record.email) {
            await removeUserFromResend(record.email);
          }
        } else if (record?.email) {
          if (old_record?.email && old_record.email.toLowerCase() !== record.email.toLowerCase()) {
            await removeUserFromResend(old_record.email);
          }
          await syncUserToResend({
            id: record.id,
            email: record.email,
            name: record.name,
          });
        }
        break;
      }

      case "DELETE": {
        const emailToRemove = old_record?.email || record?.email;
        if (emailToRemove) {
          await removeUserFromResend(emailToRemove);
        }
        break;
      }

      default:
        console.warn(`[webhooks/supabase/users] Unknown event type: ${type}`);
    }

    return NextResponse.json({ success: true, event: type });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[webhooks/supabase/users] Webhook processing failed:", message);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
