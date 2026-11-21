"use client";

import Link from "next/link";
import Image from "next/image";
import {
  AtSign,
  MessageSquare,
  ListTodo,
  AlertTriangle,
  Clock,
  Calendar,
  Target,
  Zap,
  CreditCard,
  Users,
  Shield,
  Bell,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import type { NotificationResponseItem } from "@/lib/notifications";

interface NotificationItemProps {
  notification: NotificationResponseItem;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onCloseDropdown?: () => void;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSecs < 60) return "Just now";
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "comment_mention":
    case "USER_MENTIONED":
      return {
        icon: AtSign,
        bg: "bg-blue-faint text-blue border-blue-light",
      };
    case "comment_created":
    case "COMMENT_ADDED":
      return {
        icon: MessageSquare,
        bg: "bg-cyan-50 text-cyan-600 border-cyan-200",
      };
    case "task_assigned":
    case "TASK_ASSIGNED":
      return {
        icon: ListTodo,
        bg: "bg-indigo-50 text-indigo-600 border-indigo-200",
      };
    case "task_blocked":
      return {
        icon: AlertTriangle,
        bg: "bg-rose-50 text-rose-600 border-rose-200",
      };
    case "task_due_soon":
      return {
        icon: Clock,
        bg: "bg-amber-50 text-amber-600 border-amber-200",
      };
    case "task_overdue":
      return {
        icon: Calendar,
        bg: "bg-red-50 text-red-600 border-red-200",
      };
    case "milestone_delayed":
    case "MILESTONE_DELAYED":
      return {
        icon: AlertTriangle,
        bg: "bg-amber-50 text-amber-600 border-amber-200",
      };
    case "milestone_completed":
      return {
        icon: CheckCircle2,
        bg: "bg-emerald-50 text-emerald-600 border-emerald-200",
      };
    case "goal_at_risk":
    case "goal_health_degraded":
    case "GOAL_HEALTH_WARNING":
      return {
        icon: Target,
        bg: "bg-rose-50 text-rose-600 border-rose-200",
      };
    case "quota_warning":
    case "quota_exceeded":
      return {
        icon: Zap,
        bg: "bg-purple-50 text-purple-600 border-purple-200",
      };
    case "billing_payment_failed":
      return {
        icon: CreditCard,
        bg: "bg-red-50 text-danger border-red-200",
      };
    case "billing_payment_succeeded":
      return {
        icon: CreditCard,
        bg: "bg-emerald-50 text-emerald-600 border-emerald-200",
      };
    case "workspace_invite":
    case "WORKSPACE_INVITE":
      return {
        icon: Users,
        bg: "bg-violet-50 text-violet-600 border-violet-200",
      };
    case "role_changed":
      return {
        icon: Shield,
        bg: "bg-blue-50 text-blue-700 border-blue-200",
      };
    default:
      return {
        icon: Bell,
        bg: "bg-slate-100 text-slate-600 border-border",
      };
  }
}

export function NotificationItem({
  notification,
  onMarkRead,
  onDelete,
  onCloseDropdown,
}: NotificationItemProps) {
  const { icon: Icon, bg } = getNotificationIcon(notification.type);
  const timeAgo = formatRelativeTime(notification.createdAt);

  const handleActivate = () => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
    onCloseDropdown?.();
  };

  const body = (
    <>
      {!notification.read && <span className="sr-only">Unread notification: </span>}
      {/* Type Icon / Avatar */}
      <div className="relative shrink-0">
        {notification.actor?.image ? (
          <Image
            src={notification.actor.image}
            alt={notification.actor.name || "Actor"}
            width={32}
            height={32}
            unoptimized
            className="w-8 h-8 rounded-full object-cover border border-border"
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-2xs ${bg}`}
            aria-hidden="true"
          >
            <Icon size={16} aria-hidden="true" />
          </div>
        )}

        {/* Unread indicator dot */}
        {!notification.read && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue ring-2 ring-white"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-8">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <p
            className={`text-xs font-semibold truncate ${
              notification.read ? "text-slate" : "text-ink"
            }`}
          >
            {notification.title}
          </p>
          <span className="text-[11px] text-slate shrink-0 font-medium">{timeAgo}</span>
        </div>

        <p className="text-xs text-slate/90 line-clamp-2 leading-relaxed">
          {notification.message}
        </p>

        {notification.workspace && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
              {notification.workspace.name}
            </span>
          </div>
        )}
      </div>
    </>
  );

  const surfaceClass = `flex items-start gap-3 p-3.5 w-full text-left transition-all rounded-xl cursor-pointer ${
    notification.read
      ? "bg-white hover:bg-offwhite/60 text-slate"
      : "bg-blue-faint/40 hover:bg-blue-faint/70 text-ink border-l-2 border-blue"
  }`;

  return (
    <div className="group relative rounded-xl">
      {notification.link ? (
        <Link
          href={notification.link}
          prefetch={false}
          onClick={handleActivate}
          className={`${surfaceClass} no-underline`}
        >
          {body}
        </Link>
      ) : (
        <button type="button" onClick={handleActivate} className={surfaceClass}>
          {body}
        </button>
      )}

      {/* Sibling Delete / Dismiss button — outside Link/button so no interactive nesting */}
      <button
        type="button"
        onClick={() => onDelete(notification.id)}
        className="absolute top-2.5 right-2.5 min-w-7 min-h-7 flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus:opacity-100 text-slate hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
        title="Dismiss notification"
        aria-label={`Dismiss notification: ${notification.title}`}
      >
        <Trash2 size={13} aria-hidden="true" />
      </button>
    </div>
  );
}
