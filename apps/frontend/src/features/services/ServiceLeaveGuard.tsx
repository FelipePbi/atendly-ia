"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { ServiceChanges } from "./serviceChanges";

export interface LeaveDestination {
  href: string;
  /** O "x" da barra volta à lista sem empilhar histórico; os outros links empilham. */
  replace: boolean;
}

/**
 * Quando `armed`, intercepta o clique em links de mesma origem (o "x" da barra,
 * uma linha da lista, a casca) e liga o aviso nativo de `beforeunload`. O clique
 * é tratado na captura do `document`, antes do `next/link`.
 */
export function useServiceLeaveGuard(armed: boolean, resetKey: string | undefined) {
  // O destino guarda a chave do serviço: trocar de serviço descarta o pedido.
  const [request, setRequest] = useState<{
    destination: LeaveDestination;
    key: string | undefined;
  } | null>(null);
  const releasedRef = useRef(false);
  const pending =
    request && request.key === resetKey ? request.destination : null;

  useEffect(() => {
    releasedRef.current = false;
  }, [resetKey]);

  useEffect(() => {
    if (!armed) return;

    function onClick(event: MouseEvent) {
      if (releasedRef.current) return;
      const destination = destinationOf(event);
      if (!destination) return;
      event.preventDefault();
      event.stopPropagation();
      setRequest({ destination, key: resetKey });
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (releasedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [armed, resetKey]);

  /** Desliga a guarda antes de navegar, para o aviso nativo não barrar a saída. */
  const release = useCallback(() => {
    releasedRef.current = true;
    setRequest(null);
  }, []);

  const dismiss = useCallback(() => setRequest(null), []);

  return { dismiss, pending, release };
}

function destinationOf(event: MouseEvent): LeaveDestination | null {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null;
  }
  const anchor =
    event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search
  ) {
    return null;
  }
  return {
    href: `${url.pathname}${url.search}${url.hash}`,
    replace: anchor.classList.contains("pushed-bar-back"),
  };
}

const FOCUSABLE = "button:not([disabled])";

export function ServiceLeaveSheet({
  changes,
  onContinue,
  onDiscard,
  onSave,
  saveDisabled,
}: {
  changes: ServiceChanges;
  onContinue: () => void;
  onDiscard: () => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  const titleId = useId();
  const copyId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const onContinueRef = useRef(onContinue);

  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    (saveRef.current?.disabled ? continueRef.current : saveRef.current)?.focus();
    document.body.classList.add("has-overlay");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onContinueRef.current();
        return;
      }
      const panel = panelRef.current;
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
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

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("has-overlay");
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="service-leave-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onContinue();
      }}
    >
      <section
        aria-describedby={copyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="service-leave-sheet"
        ref={panelRef}
        role="dialog"
      >
        <div aria-hidden="true" className="service-leave-handle" />
        <div className="service-leave-copy" id={copyId}>
          <h2 className="service-leave-title" id={titleId}>
            Salvar antes de sair?
          </h2>
          <p className="service-leave-sentence">
            {changes.sentence.map((part, index) =>
              part.strong ? (
                <strong key={index}>{part.text}</strong>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </p>
          {changes.snapshotNote && (
            <p className="service-leave-note">{changes.snapshotNote}</p>
          )}
        </div>
        <div className="service-leave-actions">
          <button
            className="service-leave-save"
            disabled={saveDisabled}
            ref={saveRef}
            type="button"
            onClick={onSave}
          >
            Salvar alterações
          </button>
          <button
            className="service-leave-discard"
            type="button"
            onClick={onDiscard}
          >
            Descartar
          </button>
          <button
            className="service-leave-continue"
            ref={continueRef}
            type="button"
            onClick={onContinue}
          >
            Continuar editando
          </button>
        </div>
      </section>
    </div>
  );
}
