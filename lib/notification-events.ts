/**
 * notification-events.ts — Live notification event bus.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  SERVERLESS / MULTI-INSTANCE DELIVERY — READ BEFORE DEPLOYING           │
 * │                                                                          │
 * │  The PUBLISH side works across instances: emitLiveNotification() calls  │
 * │  Redis PUBLISH when Upstash is configured, so any instance can fire an  │
 * │  event.                                                                  │
 * │                                                                          │
 * │  The SUBSCRIBE side is NOT implemented for serverless.                  │
 * │  subscribeToUserNotifications() only listens on the local in-process    │
 * │  EventEmitter.  On Vercel (and any runtime that cold-starts a new        │
 * │  process per request) the SSE handler and the notification writer will  │
 * │  almost never share a process — so events published to Redis are never  │
 * │  forwarded to the waiting SSE stream.                                   │
 * │                                                                          │
 * │  Result: "real-time" notifications silently fail to deliver on Vercel.  │
 * │                                                                          │
 * │  To fix this properly, choose ONE of:                                   │
 * │    A) Pusher / Ably / Liveblocks — managed fan-out, drop-in SDKs        │
 * │    B) Upstash QStash webhook — publishes to a persistent worker that    │
 * │       calls localEmitter.emit() on every instance                       │
 * │    C) Single-instance deployment (Railway, Fly.io, Docker single        │
 * │       replica) — local EventEmitter is fully functional                 │
 * │                                                                          │
 * │  Until one of the above is in place, do NOT advertise real-time         │
 * │  notifications as a feature of the hosted/Vercel deployment.            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SINGLE-PROCESS (development / Railway / Fly.io single replica):
 *   Leave UPSTASH_REDIS_REST_URL unset.  Falls back to a Node.js EventEmitter
 *   — fully functional, no external dependencies.
 */

import { EventEmitter } from "events";

export interface NotificationStreamEvent {
  id: string;
  userId: string;
  workspaceId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorImage?: string | null;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  link?: string | null;
  read: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

// ── In-process fallback ────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __vb_notif_emitter__: EventEmitter | undefined;
}

const localEmitter: EventEmitter =
  globalThis.__vb_notif_emitter__ ?? new EventEmitter();
// Unlimited listeners — each open SSE tab adds one listener.
// A fixed cap caused spurious MaxListenersExceededWarning in dev.
localEmitter.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalThis.__vb_notif_emitter__ = localEmitter;
}

// ── Redis pub/sub adapter ──────────────────────────────────────────────────

const REDIS_CHANNEL = "vb:notifications";

/**
 * Whether Redis pub/sub is configured.  Checked once at module load time so
 * the startup warning fires exactly once per process.
 */
const REDIS_CONFIGURED =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

/**
 * Startup warning — fires once when the module is first imported.
 *
 * On Vercel/serverless: REDIS_CONFIGURED is typically true (Upstash is set),
 * but the subscribe side is unimplemented, so cross-instance delivery is
 * broken.  The warning makes this visible in boot logs instead of only in
 * source comments.
 *
 * On single-process deployments without Redis: local EventEmitter is fully
 * functional — no warning needed.
 */
if (REDIS_CONFIGURED) {
  console.warn(
    "[notification-events] DEGRADED MODE: Upstash Redis is configured for " +
    "publishing, but the subscribe side of the SSE notification stream is not " +
    "implemented for serverless/multi-instance deployments. Notifications will " +
    "only be delivered to SSE clients that happen to share the same process as " +
    "the emitter — which on Vercel is effectively never. " +
    "To fix: replace with Pusher, Ably, or a QStash-backed subscriber worker. " +
    "See lib/notification-events.ts for the full migration guide."
  );
}

type RedisPublisher = {
  publish: (event: NotificationStreamEvent) => Promise<void>;
};

let _publisher: RedisPublisher | null | "init" = "init";

async function getPublisher(): Promise<RedisPublisher | null> {
  if (_publisher !== "init") return _publisher;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _publisher = null;
    return null;
  }

  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url, token });

    _publisher = {
      publish: async (event: NotificationStreamEvent) => {
        try {
          await redis.publish(REDIS_CHANNEL, JSON.stringify(event));
        } catch (err) {
          console.error("[notification-events] Redis publish failed:", err);
          // Fall through to local emitter as best-effort delivery on this instance.
          localEmitter.emit(`notification:${event.userId}`, event);
        }
      },
    };
  } catch (err) {
    console.warn("[notification-events] Upstash Redis unavailable, using local emitter:", err);
    _publisher = null;
  }

  return _publisher;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Emit a live notification event to active SSE clients.
 *
 * ⚠️  Cross-instance delivery caveat (see module header):
 *   When Redis is configured this publishes to the shared Redis channel, which
 *   covers the publish side correctly.  However, because no Redis subscriber
 *   process is running to forward messages back into each instance's local
 *   EventEmitter, SSE clients on a *different* instance from the emitter will
 *   NOT receive the event.  The only reliable delivery today is same-instance
 *   (local EventEmitter), which works in development and on single-replica
 *   deployments.
 *
 * - Fallback (no Redis): emits directly on the local EventEmitter only.
 */
export async function emitLiveNotification(event: NotificationStreamEvent): Promise<void> {
  try {
    const publisher = await getPublisher();

    if (publisher) {
      await publisher.publish(event);
      // Also fire locally so SSE connections on this same instance get the
      // event without waiting for a Redis round-trip.
      localEmitter.emit(`notification:${event.userId}`, event);
      if (event.workspaceId) {
        localEmitter.emit(`workspace_notification:${event.workspaceId}`, event);
      }
    } else {
      // No Redis — local delivery only (correct for single-process deployments).
      localEmitter.emit(`notification:${event.userId}`, event);
      if (event.workspaceId) {
        localEmitter.emit(`workspace_notification:${event.workspaceId}`, event);
      }
    }
  } catch (err) {
    console.error("[notification-events] Failed to emit live notification:", err);
  }
}

/**
 * Subscribe to real-time notification events for a specific user.
 * Returns an unsubscribe callback.
 *
 * ⚠️  This always hooks into the LOCAL EventEmitter only.
 *
 * On single-process deployments (dev, Railway, Fly.io single replica) this is
 * fully functional.
 *
 * On serverless/multi-instance deployments (Vercel) this will only deliver
 * events emitted by the *same* function instance.  Because Vercel cold-starts
 * a new process for each request, the SSE handler and the notification writer
 * are almost certainly on different instances — meaning this subscription will
 * rarely fire.
 *
 * Fix required: a persistent subscriber worker that calls
 * `localEmitter.emit(...)` when a message arrives on the Redis channel, or
 * replace the entire transport with Pusher / Ably / Liveblocks.
 */
export function subscribeToUserNotifications(
  userId: string,
  listener: (event: NotificationStreamEvent) => void
): () => void {
  const eventName = `notification:${userId}`;
  localEmitter.on(eventName, listener);
  return () => {
    localEmitter.off(eventName, listener);
  };
}
