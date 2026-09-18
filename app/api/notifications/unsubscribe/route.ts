import { NextRequest, NextResponse } from "next/server";
import { unsubscribeByToken, NotificationCategory } from "@/lib/notification-preferences";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications/unsubscribe?token=...&category=...
 *
 * Web browser landing page for 1-click unsubscribe links.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const category = searchParams.get("category") as NotificationCategory | null;

  if (!token) {
    return new NextResponse(renderUnsubscribeHtml("Missing Token", "The unsubscribe link is invalid or incomplete.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const result = await unsubscribeByToken(token, category || undefined);

  if (!result.success) {
    return new NextResponse(
      renderUnsubscribeHtml("Invalid Token", result.error || "We could not find an account associated with this unsubscribe link.", false),
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }

  const categoryName = category ? `"${category}"` : "all email notifications";
  const message = `You have been successfully unsubscribed from ${categoryName} on VisionBoard.`;

  return new NextResponse(renderUnsubscribeHtml("Unsubscribed Successfully", message, true), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * POST /api/notifications/unsubscribe
 *
 * RFC 8058 One-Click Unsubscribe endpoint invoked automatically by mail clients.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let token = searchParams.get("token");
  let category = searchParams.get("category") as NotificationCategory | null;

  if (!token) {
    try {
      const body = await request.json();
      token = body.token;
      category = body.category;
    } catch {
      // Ignored if request had no JSON body
    }
  }

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const result = await unsubscribeByToken(token, category || undefined);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Invalid token" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Unsubscribed successfully" });
}

function renderUnsubscribeHtml(title: string, message: string, isSuccess: boolean): string {
  const icon = isSuccess ? "✅" : "⚠️";
  const accentColor = isSuccess ? "#16a34a" : "#dc2626";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — VisionBoard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      max-width: 480px;
      width: 100%;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }
    .icon {
      font-size: 40px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: #0f172a;
    }
    p {
      font-size: 15px;
      color: #475569;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .btn {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      padding: 10px 24px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1 style="color: ${accentColor};">${title}</h1>
    <p>${message}</p>
    <a href="/account" class="btn">Manage Notification Preferences</a>
  </div>
</body>
</html>`;
}
