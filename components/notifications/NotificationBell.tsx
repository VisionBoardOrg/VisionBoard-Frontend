"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Bell, CheckCheck, Trash2, AtSign, ListTodo, ShieldAlert, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import { useNotifications, type NotificationCategory } from "@/hooks/useNotifications";
import { useConfirm } from "@/context/ConfirmContext";
import { NotificationItem } from "./NotificationItem";

interface NotificationBellProps {
  workspaceId?: string | null;
}

const POPOVER_ID = "notifications-popover";

const TABS: { id: NotificationCategory; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All", icon: Sparkles },
  { id: "mentions", label: "Mentions", icon: AtSign },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "system", label: "System", icon: ShieldAlert },
];

export function NotificationBell({ workspaceId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { confirm } = useConfirm();

  const {
    notifications,
    unreadCount,
    isLoading,
    fetchError,
    category,
    setCategory,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
    refresh,
  } = useNotifications(workspaceId);

  const closePopover = useCallback(() => {
    const el = popoverRef.current as (HTMLDivElement & { hidePopover?: () => void }) | null;
    if (el && typeof el.hidePopover === "function") {
      try {
        if (el.matches(":popover-open")) {
          el.hidePopover();
        }
      } catch {
        // Ignore if popover state is not open
      }
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    const el = popoverRef.current as (HTMLDivElement & { showPopover?: () => void }) | null;
    if (!el) return;
    if (isOpen && typeof el.showPopover === "function") {
      try {
        if (!el.matches(":popover-open")) {
          el.showPopover();
        }
      } catch {
        // Fallback to standard positioned block if showPopover fails
      }
    }
    const onToggle = (e: Event) => {
      const te = e as Event & { newState?: string };
      if (te.newState === "closed") {
        setIsOpen(false);
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, [isOpen]);

  // Close dropdown on outside click or Escape for browsers without native Popover light-dismiss
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closePopover();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closePopover();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, closePopover]);

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === "ArrowRight") {
      nextIdx = (idx + 1) % TABS.length;
    } else if (e.key === "ArrowLeft") {
      nextIdx = (idx - 1 + TABS.length) % TABS.length;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = TABS.length - 1;
    }
    if (nextIdx !== null) {
      e.preventDefault();
      setCategory(TABS[nextIdx].id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  const handleClearRead = async () => {
    const ok = await confirm({
      title: "Clear read notifications?",
      description: "All notifications you have already read will be permanently removed.",
      confirmLabel: "Clear read",
      danger: true,
    });
    if (ok) {
      await clearReadNotifications();
    }
  };

  const bellLabel =
    unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications";

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{ anchorName: "--notif-bell-anchor" } as React.CSSProperties}
        className={`relative min-w-10 min-h-10 flex items-center justify-center rounded-xl text-slate hover:text-ink hover:bg-offwhite transition-all cursor-pointer ${
          isOpen ? "bg-offwhite text-ink ring-2 ring-blue/20" : ""
        }`}
        title={bellLabel}
        aria-label={bellLabel}
        aria-expanded={isOpen}
        aria-controls={POPOVER_ID}
      >
        <Bell size={18} aria-hidden="true" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-extrabold text-white bg-blue rounded-full shadow-[--shadow-primary] animate-in zoom-in-50"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown (popover="auto" for native Top-Layer light-dismiss & Escape, anchored via CSS Anchor Positioning) */}
      {isOpen && (
        <div
          id={POPOVER_ID}
          ref={popoverRef}
          popover="auto"
          role="region"
          aria-label="Notifications"
          style={{ positionAnchor: "--notif-bell-anchor" } as React.CSSProperties}
          className="anchored-popover-end fixed inset-auto top-16 right-4 m-0 w-96 max-w-[calc(100vw-2rem)] p-0 bg-white border border-border rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-white sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ink">Notifications</h2>
              {unreadCount > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-faint text-blue border border-blue-light">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue hover:text-blue-mid transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-blue-faint"
                title="Mark all as read"
              >
                <CheckCheck size={14} aria-hidden="true" />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div
            role="tablist"
            aria-label="Notification categories"
            className="tablist-scroller flex items-center gap-1 px-3 py-2 bg-offwhite/50 border-b border-border/60"
          >
            {TABS.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = category === tab.id;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`notif-tab-${tab.id}`}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    setCategory(tab.id);
                    tabRefs.current[idx]?.scrollIntoView({ block: "nearest", inline: "nearest" });
                  }}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-blue shadow-2xs border border-border"
                      : "text-slate hover:text-ink hover:bg-white/60"
                  }`}
                >
                  <Icon size={13} className={isActive ? "text-blue" : "text-slate-400"} aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notification List Container */}
          <div
            id="notifications-panel"
            role="tabpanel"
            aria-labelledby={`notif-tab-${category}`}
            className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/30 max-h-96"
          >
            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted space-y-2" role="status">
                <div className="w-5 h-5 border-2 border-blue border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading notifications…</p>
              </div>
            ) : fetchError ? (
              <div className="py-10 px-4 text-center" role="alert">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-danger flex items-center justify-center mx-auto mb-2 border border-red-200">
                  <AlertCircle size={20} aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-ink">Couldn&apos;t load notifications</p>
                <p className="text-xs text-slate mt-1">{fetchError}</p>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue text-white text-xs font-semibold hover:bg-blue-mid transition-colors cursor-pointer"
                >
                  <RefreshCw size={12} aria-hidden="true" />
                  Retry
                </button>
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  onMarkRead={(id) => void markAsRead([id])}
                  onDelete={(id) => void deleteNotification(id)}
                  onCloseDropdown={closePopover}
                />
              ))
            ) : (
              <div className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-2xl bg-blue-faint text-blue flex items-center justify-center mx-auto mb-2 border border-blue-light/60">
                  <Bell size={20} aria-hidden="true" />
                </div>
                <p className="text-sm font-semibold text-ink">All caught up!</p>
                <p className="text-xs text-slate mt-1">
                  {category === "all"
                    ? "No notifications right now."
                    : `No ${category} notifications to show.`}
                </p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-2 border-t border-border/80 bg-offwhite/50 flex items-center justify-between text-xs">
            {notifications.some((n) => n.read) ? (
              <button
                type="button"
                onClick={() => void handleClearRead()}
                className="inline-flex items-center gap-1.5 text-xs text-slate hover:text-rose-700 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-rose-50 cursor-pointer font-medium"
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Clear read</span>
              </button>
            ) : (
              <span />
            )}
            <span className="text-[11px] text-slate px-2">Synced automatically</span>
          </div>
        </div>
      )}
    </div>
  );
}
