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

declare global {
  var __visionboard_notification_emitter__: EventEmitter | undefined;
}

const emitter = globalThis.__visionboard_notification_emitter__ ?? new EventEmitter();
// 0 = unlimited. Each SSE connection registers a listener; a fixed cap of 100
// caused spurious MaxListenersExceededWarning for power users with many tabs.
emitter.setMaxListeners(0);

if (process.env.NODE_ENV !== "production") {
  globalThis.__visionboard_notification_emitter__ = emitter;
}

/**
 * Emit a live notification event to active SSE clients subscribed to a specific userId.
 */
export function emitLiveNotification(event: NotificationStreamEvent): void {
  try {
    emitter.emit(`notification:${event.userId}`, event);
    if (event.workspaceId) {
      emitter.emit(`workspace_notification:${event.workspaceId}`, event);
    }
  } catch (err) {
    console.error("[notification-events] Failed to emit live notification:", err);
  }
}

/**
 * Subscribe to real-time notification events for a specific user.
 * Returns an unsubscribe callback.
 */
export function subscribeToUserNotifications(
  userId: string,
  listener: (event: NotificationStreamEvent) => void
): () => void {
  const eventName = `notification:${userId}`;
  emitter.on(eventName, listener);
  return () => {
    emitter.off(eventName, listener);
  };
}
