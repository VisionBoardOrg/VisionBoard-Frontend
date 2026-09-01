import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * SSE notification stream endpoint.
 *
 * NOTE: Persistent SSE streams on Vercel Serverless Functions cause 60s timeout
 * loops and excessive Fluid Memory / GB-Hour usage. Notifications are delivered
 * via visibility-aware interval polling (/api/notifications).
 */
export async function GET() {
  return NextResponse.json(
    { message: "SSE stream disabled for serverless environment. Polling is active." },
    { status: 410 }
  );
}
