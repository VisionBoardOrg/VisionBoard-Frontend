"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Safe clipboard copy hook with fallback for non-HTTPS/restricted contexts,
 * error reporting, and automatic timeout cleanup on unmount.
 */
export function useClipboard(resetMs = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string, key = "default"): Promise<boolean> => {
      setCopyError(null);
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(textarea);
          if (!ok) throw new Error("Copy failed");
        }

        setCopiedKey(key);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopiedKey(null), resetMs);
        return true;
      } catch {
        setCopyError("Could not copy automatically. Please copy manually.");
        return false;
      }
    },
    [resetMs]
  );

  return {
    copied: copiedKey !== null,
    copiedKey,
    copyError,
    copy,
  };
}
