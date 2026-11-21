"use client";

import { AlertTriangle, X, Info, Zap } from "lucide-react";
import { useState } from "react";

type AlertVariant = "warning" | "info" | "ai";

interface AlertBannerProps {
  message: string;
  variant?: AlertVariant;
  dismissable?: boolean;
}

const VARIANTS = {
  warning: { icon: AlertTriangle, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", iconColor: "text-amber-500" },
  info: { icon: Info, bg: "bg-blue-faint", border: "border-blue-light", text: "text-blue-deep", iconColor: "text-blue" },
  ai: { icon: Zap, bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-800", iconColor: "text-violet-500" },
};

export function AlertBanner({ message, variant = "info", dismissable = true }: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { icon: Icon, bg, border, text, iconColor } = VARIANTS[variant];

  return (
    <div role="status" className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${bg} ${border}`}>
      <Icon size={16} className={`${iconColor} shrink-0 mt-0.5`} aria-hidden="true" />
      <p className={`text-sm flex-1 ${text}`}>{message}</p>
      {dismissable && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss alert"
          className={`${text} opacity-60 hover:opacity-100 transition-opacity cursor-pointer`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
