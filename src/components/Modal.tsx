"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

function getFocusableItems(root: HTMLElement | null) {
  return [
    ...(root?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) || []),
  ].filter(
    (element) =>
      !element.closest("[hidden], [aria-hidden='true'], [inert]") &&
      element.getClientRects().length > 0,
  );
}

export function Modal({
  titleId,
  onClose,
  children,
}: {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const items = getFocusableItems(dialog.current);
    const focusable =
      items.find((element) => element.hasAttribute("autofocus")) || items[0];
    (focusable || dialog.current)?.focus();
    function onKeyDown(event: KeyboardEvent) {
      const openDialogs = [...document.querySelectorAll("[role='dialog']")];
      if (openDialogs[openDialogs.length - 1] !== dialog.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = getFocusableItems(dialog.current);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!dialog.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      const openDialogs = [...document.querySelectorAll("[role='dialog']")];
      if (openDialogs[openDialogs.length - 1] !== dialog.current) return;
      if (
        event.target instanceof Node &&
        dialog.current?.contains(event.target)
      )
        return;
      const first = getFocusableItems(dialog.current)[0];
      (first || dialog.current)?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      previousFocus.current?.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-dialog-content"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
