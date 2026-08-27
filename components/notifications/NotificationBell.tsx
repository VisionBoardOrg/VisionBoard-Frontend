"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bell, CheckCheck, Trash2, AtSign, ListTodo, ShieldAlert, Sparkles } from "lucide-react";
import { useNotifications, type NotificationCategory } from "@/hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";

interface NotificationBellProps {
  workspaceId?: string | null;
}

export function NotificationBell({ workspaceId }: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    isLoading,
    category,
    setCategory,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearReadNotifications,
  } = useNotifications(workspaceId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const tabs: { id: NotificationCategory; label: string; icon: React.ElementType }[] = [
    { id: "all", label: "All", icon: Sparkles },
    { id: "mentions", label: "Mentions", icon: AtSign },
    { id: "tasks", label: "Tasks", icon: ListTodo },
    { id: "system", label: "System", icon: ShieldAlert },
  ];

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Bell Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative p-2 rounded-xl text-slate hover:text-ink hover:bg-offwhite transition-all cursor-pointer ${
          isOpen ? "bg-offwhite text-ink ring-2 ring-blue/20" : ""
        }`}
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <Bell size={18} />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-extrabold text-white bg-blue rounded-full shadow-[--shadow-primary] animate-in zoom-in-50">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-border rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-white sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-ink">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-faint text-blue border border-blue-light">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue hover:text-blue-mid transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-blue-faint"
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1 px-3 py-2 bg-offwhite/50 border-b border-border/60 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = category === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCategory(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-blue shadow-2xs border border-border"
                      : "text-slate hover:text-ink hover:bg-white/60"
                  }`}
                >
                  <Icon size={13} className={isActive ? "text-blue" : "text-slate-400"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Notification List Container */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/30 max-h-96">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-muted space-y-2">
                <div className="w-5 h-5 border-2 border-blue border-t-transparent rounded-full animate-spin mx-auto" />
                <p>Loading notifications…</p>
              </div>
            ) : notifications.length > 0 ? (
              notifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  onMarkRead={(id) => markAsRead([id])}
                  onDelete={deleteNotification}
                  onCloseDropdown={() => setIsOpen(false)}
                />
              ))
            ) : (
              <div className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-2xl bg-blue-faint text-blue flex items-center justify-center mx-auto mb-2 border border-blue-light/60">
                  <Bell size={20} />
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
          {notifications.some((n) => n.read) && (
            <div className="p-2 border-t border-border/80 bg-offwhite/50 flex items-center justify-between text-xs">
              <button
                onClick={() => clearReadNotifications()}
                className="inline-flex items-center gap-1.5 text-xs text-slate hover:text-rose-600 transition-colors px-2.5 py-1 rounded-lg hover:bg-rose-50 cursor-pointer font-medium"
              >
                <Trash2 size={13} />
                <span>Clear read</span>
              </button>
              <span className="text-[10px] text-muted font-mono">Real-time sync</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
