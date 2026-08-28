"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "@/shared/icons/Icon";

type DialogProps = {
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  open: boolean;
  title: string;
  variant?: "modal" | "sheet";
};

export function Dialog({
  children,
  eyebrow,
  onClose,
  open,
  title,
  variant = "modal",
}: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const selector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    panel?.querySelector<HTMLElement>(selector)?.focus();
    document.body.classList.add("has-overlay");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(selector));
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("has-overlay");
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className={`overlay${variant === "sheet" ? " bottom-sheet-wrap" : ""}`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={variant === "sheet" ? "bottom-sheet" : "modal"}
        ref={panelRef}
        role="dialog"
      >
        {variant === "sheet" && (
          <div className="sheet-handle" aria-hidden="true" />
        )}
        <div className="modal-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <Icon name="x" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
