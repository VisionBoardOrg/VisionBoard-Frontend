/**
 * Per-process short-TTL cache + in-flight deduplication for GET /api/notifications.
 *
 * Notifications poll every 30s and on tab focus (`visibilitychange`), usually
 * returning identical data. Caching per `(userId, queryParams)` for 25s and
 * coalescing concurrent in-flight requests eliminates redundant remote DB
 * round-trips while staying fresh via explicit invalidation on writes.
 */

const NOTIFICATION_CACHE_TTL_MS = 25 * 1000;
const MAX_CACHE_ENTRIES = 500;

export interface CachedNotificationsResult {
  notifications: unknown[];
  unreadCount: number | null;
  nextCursor: string | null;
}

type CacheEntry = {
  v: CachedNotificationsResult;
  ts: number;
};

const globalForNotifCache = globalThis as unknown as {
  notifCache?: Map<string, CacheEntry>;
  notifInflight?: Map<string, Promise<CachedNotificationsResult>>;
};

const notifCache = (globalForNotifCache.notifCache ??= new Map());
const notifInflight = (globalForNotifCache.notifInflight ??= new Map());

export function buildNotificationCacheKey(params: {
  userId: string;
  workspaceId: string | null;
  category: string;
  unreadOnly: boolean;
  limit: number;
  cursor: string | null;
  countOnly: boolean;
}): string {
  return `${params.userId}|${params.workspaceId ?? ""}|${params.category}|${params.unreadOnly ? 1 : 0}|${params.limit}|${params.cursor ?? ""}|${params.countOnly ? 1 : 0}`;
}

export async function getOrFetchNotifications(
  key: string,
  fetcher: () => Promise<CachedNotificationsResult>
): Promise<{ data: CachedNotificationsResult; cacheStatus: "HIT" | "COALESCED" | "MISS" }> {
  const now = Date.now();
  const cached = notifCache.get(key);
  if (cached && now - cached.ts < NOTIFICATION_CACHE_TTL_MS) {
    return { data: cached.v, cacheStatus: "HIT" };
  }
  if (cached) {
    notifCache.delete(key);
  }

  const existing = notifInflight.get(key);
  if (existing) {
    const data = await existing;
    return { data, cacheStatus: "COALESCED" };
  }

  const promise = fetcher();
  notifInflight.set(key, promise);

  try {
    const data = await promise;
    const writeTs = Date.now();
    notifCache.set(key, { v: data, ts: writeTs });

    if (notifCache.size > MAX_CACHE_ENTRIES) {
      const cutoff = writeTs - NOTIFICATION_CACHE_TTL_MS;
      for (const [k, entry] of Array.from(notifCache.entries())) {
        if (entry.ts < cutoff) notifCache.delete(k);
      }
      while (notifCache.size > MAX_CACHE_ENTRIES - 100) {
        const oldestKey = notifCache.keys().next().value;
        if (oldestKey === undefined) break;
        notifCache.delete(oldestKey);
      }
    }

    return { data, cacheStatus: "MISS" };
  } finally {
    if (notifInflight.get(key) === promise) {
      notifInflight.delete(key);
    }
  }
}

/**
 * Invalidate all cached notification entries for a specific user.
 * Call after creating, marking read, or deleting notifications.
 */
export function invalidateUserNotificationCache(userId: string): void {
  const prefix = `${userId}|`;
  for (const key of Array.from(notifCache.keys())) {
    if (key.startsWith(prefix)) {
      notifCache.delete(key);
    }
  }
}
