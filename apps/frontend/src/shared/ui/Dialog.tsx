"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/shared/icons/Icon";

import { cycleFocus, FOCUSABLE_SELECTOR } from "./focusCycle";

type DialogProps = {
  children: ReactNode;
  eyebrow?: string;
  onClose: () => void;
  open: boolean;
  title: string;
};

/**
 * Todo diálogo do app é um cartão flutuante centrado sobre o véu, em qualquer
 * largura (D-204): no celular também, com margem dos lados, em vez de folha
 * presa embaixo ou gaveta na lateral. Prende o foco, fecha com Esc ou com um
 * toque no véu e devolve o foco a quem o abriu.
 */
export function Dialog({
  children,
  eyebrow,
  onClose,
  open,
  title,
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
    panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    document.body.classList.add("has-overlay");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel) return;
      cycleFocus(panel, event);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("has-overlay");
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus.current?.focus();
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;
  // No `body`, fora da árvore da tela: dentro do conteúdo, uma animação ou
  // transição da página cria contexto de empilhamento próprio, e a barra
  // inferior do celular ficava por cima do diálogo (2026-10-17).
  return createPortal(
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal"
        ref={panelRef}
        role="dialog"
      >
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
    </div>,
    document.body,
  );
}
