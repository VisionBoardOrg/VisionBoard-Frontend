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
 * Keyboard & focus accessibility for modal `<dialog>` elements and fallback containers:
 * - Opens native `<dialog>` elements via `showModal()` (providing top-layer promotion,
 *   background `inert`, native focus containment, `::backdrop`, and focus return)
 * - Polyfills `<dialog closedby="any">` light-dismiss using pointerdown + pointerup
 *   bounding-box checks when `HTMLDialogElement.prototype.closedBy` is unavailable
 * - Does NOT mutate `document.body.style.overflow` (scroll containment is handled via
 *   CSS `overscroll-behavior: contain` on `dialog:modal` and `dialog::backdrop`)
 */
export function useModalA11y(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
  options?: UseModalA11yOptions
) {
  const onCloseRef = useRef(onClose);
  const initialFocusRef = options?.initialFocusRef;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const node = ref.current;
    if (!node) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (typeof HTMLDialogElement !== "undefined" && node instanceof HTMLDialogElement) {
      if (!node.open) {
        try {
          node.showModal();
        } catch {
          // Ignore if already open in another mode
        }
      }

      const focusFrame = requestAnimationFrame(() => {
        if (initialFocusRef?.current && node.contains(initialFocusRef.current)) {
          initialFocusRef.current.focus();
        }
      });

      const handleCancel = (e: Event) => {
        e.preventDefault();
        onCloseRef.current();
      };

      node.addEventListener("cancel", handleCancel);

      let cleanupLightDismiss: (() => void) | undefined;
      const closedByAttr = node.getAttribute("closedby");
      if (closedByAttr === "any" && !("closedBy" in HTMLDialogElement.prototype)) {
        let pressedOutside = false;
        const isOutside = (e: PointerEvent) => {
          const r = node.getBoundingClientRect();
          return (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          );
        };
        const onPointerDown = (e: PointerEvent) => {
          pressedOutside = isOutside(e);
        };
        const onPointerUp = (e: PointerEvent) => {
          if (pressedOutside && isOutside(e)) {
            onCloseRef.current();
          }
        };
        node.addEventListener("pointerdown", onPointerDown);
        node.addEventListener("pointerup", onPointerUp);
        cleanupLightDismiss = () => {
          node.removeEventListener("pointerdown", onPointerDown);
          node.removeEventListener("pointerup", onPointerUp);
        };
      }

      return () => {
        cancelAnimationFrame(focusFrame);
        node.removeEventListener("cancel", handleCancel);
        cleanupLightDismiss?.();
        if (node.open) {
          try {
            node.close();
          } catch {
            // Ignore if already detached
          }
        }
      };
    }

    const focusFrame = requestAnimationFrame(() => {
      if (initialFocusRef?.current && node.contains(initialFocusRef.current)) {
        initialFocusRef.current.focus();
        return;
      }
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
      const current = ref.current;
      if (!current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key !== "Tab") return;

      const focusables = Array.from(
        current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.getClientRects().length > 0 || el === document.activeElement);

      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && (activeEl === first || !current.contains(activeEl))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (activeEl === last || !current.contains(activeEl))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === "function" && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [ref, active, initialFocusRef]);
}
