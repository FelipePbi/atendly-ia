"use client";

import clsx from "clsx";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import type { SessionCategory } from "@/data";

export type CategoryWriteScope = "CONVERSATION" | "CONTACT";

type ConversationActionsSheetProps = {
  busy: boolean;
  category: SessionCategory;
  error: string | null;
  ignored: boolean;
  onClose: () => void;
  onIgnore: () => void;
  onMarkPersonal: (scope: CategoryWriteScope) => void;
  onMoveToCommercial: () => void;
  onViewContact: () => void;
  open: boolean;
  person: string;
};

const focusable =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function RowIcon({
  children,
  stroke = "#5F574E",
}: {
  children: ReactNode;
  stroke?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width="22"
    >
      {children}
    </svg>
  );
}

/**
 * O menu "Mais ações" do chat, como o quadro K6: folha embaixo no celular,
 * folha centrada de 768 px em diante. Só existe montado enquanto aberto, então
 * a escolha de "Marcar como pessoal" nasce sempre em "Só esta conversa" e
 * nada é gravado antes do botão.
 */
export function ConversationActionsSheet(props: ConversationActionsSheetProps) {
  if (!props.open) return null;
  return <OpenSheet {...props} />;
}

/**
 * A casca das folhas do chat (K5 e K6): folha embaixo no celular, diálogo
 * centrado de 768 px em diante. Prende o foco, fecha com Escape e devolve o
 * foco a quem a abriu.
 */
export function ChatSheetShell({
  children,
  className,
  onClose,
  title,
  titleId: visibleTitleId,
}: {
  children: ReactNode;
  className?: string;
  onClose: () => void;
  title: string;
  /** Id de um título visível dentro de `children`; sem ele a casca traz um título só para leitor de tela. */
  titleId?: string;
}) {
  const ownTitleId = useId();
  const titleId = visibleTitleId ?? ownTitleId;
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(focusable)?.focus();
    document.body.classList.add("has-overlay");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(focusable));
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
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="chat-sheet-wrap"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={clsx("chat-sheet", className)}
        ref={panelRef}
        role="dialog"
      >
        {!visibleTitleId && (
          <h2 className="sr-only" id={titleId}>
            {title}
          </h2>
        )}
        <div aria-hidden="true" className="chat-sheet-handle" />
        {children}
      </section>
    </div>
  );
}

function OpenSheet({
  busy,
  category,
  error,
  ignored,
  onClose,
  onIgnore,
  onMarkPersonal,
  onMoveToCommercial,
  onViewContact,
  person,
}: ConversationActionsSheetProps) {
  const [personalOpen, setPersonalOpen] = useState(false);
  const [scope, setScope] = useState<CategoryWriteScope>("CONVERSATION");

  const canMoveToCommercial = category !== "COMMERCIAL";
  const canMarkPersonal = category !== "PERSONAL";
  const personalExpanded = canMarkPersonal && personalOpen;

  return (
    <ChatSheetShell onClose={onClose} title="Mais ações">
      {error && (
        <p className="chat-sheet-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="chat-sheet-row"
        disabled={busy}
        onClick={onViewContact}
        type="button"
      >
        <RowIcon>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </RowIcon>
        <span>Ver contato</span>
      </button>
      {canMoveToCommercial && (
        <button
          className="chat-sheet-row"
          disabled={busy}
          onClick={onMoveToCommercial}
          type="button"
        >
          <RowIcon>
            <path d="M4 7h16M4 12h16M4 17h10" />
            <path d="M16 15l3 3 3-3M19 18v-9" />
          </RowIcon>
          <span>Mover para Comercial</span>
        </button>
      )}
      {canMarkPersonal && (
        <div
          className={clsx("chat-sheet-personal", personalExpanded && "is-open")}
        >
          <button
            aria-expanded={personalExpanded}
            className="chat-sheet-row"
            disabled={busy}
            onClick={() => setPersonalOpen((value) => !value)}
            type="button"
          >
            <RowIcon stroke={personalExpanded ? "#221E1A" : "#5F574E"}>
              <path d="M9 6v12M15 6v12" />
            </RowIcon>
            <span>Marcar como pessoal</span>
          </button>
          {personalExpanded && (
            <div className="chat-sheet-options">
              <div
                aria-label="Onde a IA para de responder"
                className="chat-sheet-radios"
                role="radiogroup"
              >
                <PersonalOption
                  checked={scope === "CONVERSATION"}
                  description="A IA para de responder aqui. Uma nova conversa volta ao normal."
                  disabled={busy}
                  onSelect={() => setScope("CONVERSATION")}
                  title="Só esta conversa"
                />
                <PersonalOption
                  checked={scope === "CONTACT"}
                  description="A IA nunca mais responde este contato."
                  disabled={busy}
                  onSelect={() => setScope("CONTACT")}
                  title={`Sempre, para ${person}`}
                />
              </div>
              <button
                className="chat-sheet-submit"
                disabled={busy}
                onClick={() => onMarkPersonal(scope)}
                type="button"
              >
                {busy ? "Salvando…" : "Marcar como pessoal"}
              </button>
            </div>
          )}
        </div>
      )}
      <button
        className="chat-sheet-row is-last"
        disabled={busy}
        onClick={onIgnore}
        type="button"
      >
        <RowIcon>
          <circle cx="12" cy="12" r="8" />
          <path d="M6.5 6.5l11 11" />
        </RowIcon>
        <span>
          {ignored ? "Voltar a usar na IA" : "Ignorar IA para este contato"}
        </span>
      </button>
    </ChatSheetShell>
  );
}

function PersonalOption({
  checked,
  description,
  disabled,
  onSelect,
  title,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  onSelect: () => void;
  title: string;
}) {
  return (
    <label className={clsx("chat-sheet-option", checked && "is-checked")}>
      <input
        checked={checked}
        className="sr-only"
        disabled={disabled}
        name="chat-sheet-personal-scope"
        onChange={onSelect}
        type="radio"
      />
      <span aria-hidden="true" className="chat-sheet-dot">
        {checked && (
          <svg
            fill="none"
            height="11"
            stroke="#F7F4EF"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.5"
            viewBox="0 0 24 24"
            width="11"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        )}
      </span>
      <span className="chat-sheet-option-copy">
        <span className="chat-sheet-option-title">{title}</span>
        <span className="chat-sheet-option-hint">{description}</span>
      </span>
    </label>
  );
}
