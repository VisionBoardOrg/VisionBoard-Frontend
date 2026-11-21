"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseModalA11yOptions {
  /** Optional ref to receive initial focus when the dialog opens. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Lock document body scrolling while active (default: true). */
  lockScroll?: boolean;
}

/**
 * Keyboard & focus accessibility for modal dialogs and slide-over drawers:
 * - Moves initial focus inside the dialog on open
 * - Traps Tab / Shift+Tab within the dialog
 * - Closes on Escape (stopping propagation so nested dialogs close cleanly)
 * - Locks background scrolling while open
 * - Restores focus to the triggering element on close
 */
export function useModalA11y(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
  options?: UseModalA11yOptions
) {
  const onCloseRef = useRef(onClose);
  const initialFocusRef = options?.initialFocusRef;
  const lockScroll = options?.lockScroll ?? true;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    if (lockScroll) {
      document.body.style.overflow = "hidden";
    }

    const focusFrame = requestAnimationFrame(() => {
      const node = ref.current;
      if (!node) return;
      if (initialFocusRef?.current && node.contains(initialFocusRef.current)) {
        initialFocusRef.current.focus();
        return;
      }
      // If something inside the dialog already took focus (e.g. autoFocus), preserve it
      if (node.contains(document.activeElement)) return;
      const firstFocusable = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).find((el) => el.getClientRects().length > 0);

      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        if (!node.hasAttribute("tabindex")) {
          node.setAttribute("tabindex", "-1");
        }
        node.focus();
      }
    });

    function onKeyDown(e: KeyboardEvent) {
      const node = ref.current;
      if (!node) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab") return;

      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.getClientRects().length > 0 || el === document.activeElement);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && (activeEl === first || !node.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || !node.contains(activeEl))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      if (lockScroll) {
        document.body.style.overflow = prevOverflow;
      }
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [ref, active, initialFocusRef, lockScroll]);
}
