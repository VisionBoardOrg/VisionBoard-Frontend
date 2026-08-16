import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { subscribeToUserNotifications } from "@/lib/notification-events";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Initial ping / connected message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "CONNECTED", userId })}\n\n`));

      // Subscribe to live notification events for this user
      const unsubscribe = subscribeToUserNotifications(userId, (event) => {
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error("[notifications/stream] Error pushing SSE event:", err);
        }
      });

      // Keep-alive heartbeat every 20s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":keepalive\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20_000);

      // Clean up when client disconnects
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
