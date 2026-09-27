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
 */

import { NextRequest, NextResponse } from "next/server";
import { syncUserToResend, removeUserFromResend } from "@/lib/resend-sync";

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
  if (webhookSecret) {
    const incomingSecret =
      request.headers.get("x-supabase-webhook-secret") ||
      new URL(request.url).searchParams.get("secret");
    if (incomingSecret !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
          // If user scheduled deletion, remove or keep unsubscribed
          if (record.email) {
            await removeUserFromResend(record.email);
          }
        } else if (record?.email) {
          // If email changed, remove previous email from Resend
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
    return NextResponse.json({ error: "Webhook error", details: message }, { status: 500 });
  }
}
