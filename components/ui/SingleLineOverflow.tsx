"use client";

import React, { useEffect, useRef, useState } from "react";

interface SingleLineOverflowProps {
  text: string;
  className?: string;
  /** When true, makes the element keyboard-focusable (tabIndex=0) only while its text is actually truncated */
  focusableWhenTruncated?: boolean;
}

/**
 * Accessible single-line text overflow component (`single-line-overflow` guide):
 * - Keeps the full text in the DOM for screen readers, Find-in-Page, and copy/paste
 * - Detects truncation in CSS via `animation-timeline: scroll(self inline)` (`--truncated: 1`)
 *   and in JS via `ResizeObserver` (`scrollWidth > clientWidth`) as a cross-browser fallback
 *   that also sets `--scroll-width` for constant-speed inline scroll reveal
 * - Reveals the full text on `:hover` and `:focus-visible` (respecting `prefers-reduced-motion`)
 */
export function SingleLineOverflow({
  text,
  className = "",
  focusableWhenTruncated = false,
}: SingleLineOverflowProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const hiddenPx = el.scrollWidth - el.clientWidth;
      const truncated = hiddenPx > 1;
      el.classList.toggle("truncated", truncated);
      if (truncated) {
        el.style.setProperty("--scroll-width", String(Math.max(40, hiddenPx)));
      } else {
        el.style.removeProperty("--scroll-width");
      }
      setIsTruncated(truncated);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span
      ref={ref}
      tabIndex={focusableWhenTruncated && isTruncated ? 0 : undefined}
      className={`single-line-reveal ${className}`}
    >
      <span>{text}</span>
    </span>
  );
}
