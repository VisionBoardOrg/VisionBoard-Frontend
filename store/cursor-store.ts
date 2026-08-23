"use client";

import { create } from "zustand";
import type { RemoteCursor } from "@/hooks/useWebSocket";

/** Identity-only view of a collaborator (no position — safe to keep stable). */
export interface PresenceUser {
  userId: string;
  userName: string;
  userColor: string;
  userImage?: string | null;
}

/**
 * Incoming cursor update — identity fields are optional because the wire
 * protocol sends them only on the first move (and periodically after that),
 * not with every 40ms position packet.
 */
export type CursorUpdate = Partial<RemoteCursor> & {
  userId: string;
  x: number;
  y: number;
};

interface CursorState {
  /**
   * All live remote cursors keyed by userId. Only the cursor overlay layer
   * (LiveCursorsCanvas) subscribes to this — it changes on every position
   * packet and must NOT re-render the board itself.
   */
  cursors: Record<string, RemoteCursor>;
  /**
   * cardId → remote viewers. Object identity is preserved across position-only
   * updates, so cards subscribed via selectors re-render only when the SET of
   * viewers changes, not on every cursor move.
   */
  viewersByCard: Record<string, RemoteCursor[]>;
  /**
   * Identity of online collaborators. Stable until someone joins/leaves —
   * safe for toolbar avatars without per-move re-renders.
   */
  activeUsers: PresenceUser[];

  applyCursor: (update: CursorUpdate) => void;
  applyIdentity: (user: PresenceUser) => void;
  removeCursor: (userId: string) => void;
  /** Drop cursors not heard from within maxAgeMs (idle-prune). */
  pruneStale: (maxAgeMs: number) => void;
  reset: () => void;
}

function identityOf(c: RemoteCursor): PresenceUser {
  return { userId: c.userId, userName: c.userName, userColor: c.userColor, userImage: c.userImage };
}

function buildViewers(cursors: Record<string, RemoteCursor>): Record<string, RemoteCursor[]> {
  const map: Record<string, RemoteCursor[]> = {};
  for (const c of Object.values(cursors)) {
    if (c.selectedCardId) {
      (map[c.selectedCardId] ??= []).push(c);
    }
  }
  return map;
}

function buildActiveUsers(cursors: Record<string, RemoteCursor>): PresenceUser[] {
  return Object.values(cursors).map(identityOf);
}

function sameMembers(activeUsers: PresenceUser[], cursors: Record<string, RemoteCursor>): boolean {
  if (activeUsers.length !== Object.keys(cursors).length) return false;
  return activeUsers.every((u) => cursors[u.userId] !== undefined);
}

/**
 * Live-cursor presence store. Lives OUTSIDE BoardCanvas's render state so a
 * 25Hz remote cursor stream updates only the cursor overlay — not the whole
 * board tree (toolbar, kanban, detail panel, hundreds of cards).
 */
export const useCursorStore = create<CursorState>((set, get) => ({
  cursors: {},
  viewersByCard: {},
  activeUsers: [],

  applyCursor: (update) => {
    const { cursors, viewersByCard, activeUsers } = get();
    const prev = cursors[update.userId];
    const merged: RemoteCursor = {
      userId: update.userId,
      userName: update.userName ?? prev?.userName ?? "Teammate",
      userColor: update.userColor ?? prev?.userColor ?? "#2563EB",
      userImage: update.userImage ?? prev?.userImage,
      x: update.x,
      y: update.y,
      selectedCardId: update.selectedCardId ?? null,
      lastSeen: Date.now(),
    };
    const nextCursors = { ...cursors, [update.userId]: merged };

    // Viewers-by-card changes only when selection membership changes — keep
    // the previous object reference otherwise so card subscribers stay idle.
    const selectionChanged =
      (prev?.selectedCardId ?? null) !== (merged.selectedCardId ?? null);
    const nextViewers = selectionChanged ? buildViewers(nextCursors) : viewersByCard;

    // Presence list changes only on join/leave.
    const nextActive = sameMembers(activeUsers, nextCursors)
      ? activeUsers
      : buildActiveUsers(nextCursors);

    set({
      cursors: nextCursors,
      ...(selectionChanged ? { viewersByCard: nextViewers } : {}),
      ...(nextActive !== activeUsers ? { activeUsers: nextActive } : {}),
    });
  },

  applyIdentity: (user) => {
    const { cursors, activeUsers } = get();
    const prev = cursors[user.userId];
    let nextCursors = cursors;
    if (prev) {
      nextCursors = {
        ...cursors,
        [user.userId]: { ...prev, ...user },
      };
    }
    const nextActive = activeUsers.map((u) => (u.userId === user.userId ? user : u));
    set({
      ...(nextCursors !== cursors ? { cursors: nextCursors } : {}),
      ...(nextActive !== activeUsers ? { activeUsers: nextActive } : {}),
    });
  },

  removeCursor: (userId) => {
    const { cursors } = get();
    if (!cursors[userId]) return;
    const nextCursors = { ...cursors };
    delete nextCursors[userId];
    set({
      cursors: nextCursors,
      viewersByCard: buildViewers(nextCursors),
      activeUsers: buildActiveUsers(nextCursors),
    });
  },

  pruneStale: (maxAgeMs) => {
    const { cursors } = get();
    const now = Date.now();
    const nextCursors: Record<string, RemoteCursor> = {};
    let changed = false;
    for (const [id, cursor] of Object.entries(cursors)) {
      if (now - cursor.lastSeen <= maxAgeMs) {
        nextCursors[id] = cursor;
      } else {
        changed = true;
      }
    }
    if (!changed) return;
    set({
      cursors: nextCursors,
      viewersByCard: buildViewers(nextCursors),
      activeUsers: buildActiveUsers(nextCursors),
    });
  },

  reset: () => set({ cursors: {}, viewersByCard: {}, activeUsers: [] }),
}));
