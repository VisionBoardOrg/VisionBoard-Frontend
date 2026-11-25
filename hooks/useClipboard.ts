"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Safe clipboard copy hook with fallback for non-HTTPS/restricted contexts,
 * error reporting, and automatic timeout cleanup on unmount.
 */
export function useClipboard(resetMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const lastAnnouncedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const announce = useCallback((baseMessage: string) => {
    let nextMsg = baseMessage;
    if (nextMsg === lastAnnouncedRef.current) {
      nextMsg += "\u00A0";
    }
    lastAnnouncedRef.current = nextMsg;
    setStatusMessage(nextMsg);
  }, []);

  const copy = useCallback(
    async (text: string, key = "default"): Promise<boolean> => {
      setCopyError(null);
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const previousFocus = document.activeElement as HTMLElement | null;
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.setAttribute("readonly", "");
          textarea.style.cssText = "position:fixed;inset-block-start:0;opacity:0";
          document.body.appendChild(textarea);
          textarea.select();
          try {
            const ok = document.execCommand("copy");
            if (!ok) throw new Error("Copy failed");
          } finally {
            textarea.remove();
            previousFocus?.focus?.({ preventScroll: true });
          }
        }

        setCopiedKey(key);
        announce("Copied");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setCopiedKey(null);
          setStatusMessage("");
        }, resetMs);
        return true;
      } catch {
        setCopyError("Could not copy automatically. Please copy manually.");
        announce("Copy failed");
        return false;
      }
    },
    [resetMs, announce]
  );

  return {
    copied: copiedKey !== null,
    copiedKey,
    copyError,
    statusMessage,
    copy,
  };
}
