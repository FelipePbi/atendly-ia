"use client";

import clsx from "clsx";
import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

import type { Conversation, SessionCategory } from "@/data";

import { conversationState } from "./conversationState";

export type TreatmentPosition = "AUTOMATIC" | "ALWAYS" | "NEVER";

const treatmentOptions: ReadonlyArray<{
  label: string;
  value: TreatmentPosition;
}> = [
  { label: "Automático", value: "AUTOMATIC" },
  { label: "Sempre atende", value: "ALWAYS" },
  { label: "Nunca responde", value: "NEVER" },
];

/**
 * A decisão manual do contato. `contactCategory` é a leitura direta; na
 * resposta antiga, sem o campo, o escopo da decisão vigente diz de quem ela é:
 * `CONTACT` é a própria `category`, nenhum escopo é sem decisão e `CONVERSATION`
 * não diz nada sobre o contato (`undefined`).
 */
function contactDecision(
  conversation: Conversation,
): SessionCategory | null | undefined {
  if (conversation.contactCategory !== undefined) {
    return conversation.contactCategory;
  }
  if (conversation.categoryScope === "CONVERSATION") return undefined;
  if (conversation.categoryScope === "CONTACT") {
    return conversation.category ?? null;
  }
  return null;
}

/** A posição marcada do controle; `null` quando nenhuma descreve o contato. */
export function treatmentPosition(
  conversation: Conversation,
): TreatmentPosition | null {
  if (conversation.ignored) return "NEVER";
  const decision = contactDecision(conversation);
  if (decision === undefined) return null;
  if (decision === null) return "AUTOMATIC";
  return decision === "PERSONAL" ? null : "ALWAYS";
}

/** A frase abaixo do controle: a primeira regra que vale. */
export function treatmentHint(conversation: Conversation, person: string) {
  if (conversation.categoryScope === "CONVERSATION") {
    return "Só esta conversa está em Pessoal: a IA não responde aqui. Automático ou Sempre atende tiram esta conversa de Pessoal.";
  }
  if (contactDecision(conversation) === "PERSONAL") {
    return `${person} está em Pessoal para sempre: a IA nunca responde. Escolha Automático ou Sempre atende para mudar.`;
  }
  if (conversation.ignored) {
    return `Nunca responde: a IA não responde nem usa as conversas de ${person}. As mensagens continuam aqui.`;
  }
  if (treatmentPosition(conversation) === "ALWAYS") {
    return `Sempre atende: a IA responde ${person} mesmo quando a conversa parece pessoal.`;
  }
  return "Automático: a IA decide pela conversa. “Nunca responde” é o mesmo que Ignorar IA.";
}

/**
 * Tocar a posição já marcada não grava. A exceção é a decisão "Só esta
 * conversa": ela continua valendo sobre a posição do contato, e a frase diz que
 * Automático e Sempre atende a tiram de Pessoal.
 */
export function treatmentWritesOnTap(
  conversation: Conversation,
  position: TreatmentPosition,
): boolean {
  if (treatmentPosition(conversation) !== position) return true;
  return position !== "NEVER" && conversation.categoryScope === "CONVERSATION";
}

function RowIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      style={{ stroke: "var(--at-color-ink-soft)" }}
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
 * O controle "Como a IA trata este contato" do quadro K5 e a seção "Nesta
 * conversa" com as ações que o quadro não desenha. Nada é gravado aqui: cada
 * toque vira `onChooseTreatment`, e quem chama grava pelas rotas de hoje.
 */
export function ConversationContextPanel({
  conversation,
  onChooseTreatment,
  onResolve,
  onTakeover,
  person,
  takeoverBusy,
  treatmentBusy,
  treatmentError,
}: {
  conversation: Conversation;
  onChooseTreatment: (position: TreatmentPosition) => void;
  onResolve: () => void;
  onTakeover?: () => void;
  person: string;
  takeoverBusy?: boolean;
  treatmentBusy: boolean;
  treatmentError: string | null;
}) {
  const labelId = useId();
  const hintId = useId();
  const actionsId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const position = treatmentPosition(conversation);
  const closed = conversation.status === "CLOSED";
  const canTakeover =
    Boolean(onTakeover) &&
    !closed &&
    conversationState(conversation) !== "you-handling";
  const tabStop = position ?? treatmentOptions[0].value;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    const radios = Array.from(
      groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
    );
    const index = radios.findIndex((radio) => radio === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    radios[(index + step + radios.length) % radios.length]?.focus();
  }

  return (
    <>
      <section className="customer-sheet-treatment">
        <span className="customer-sheet-label" id={labelId}>
          Como a IA trata este contato
        </span>
        <div
          aria-busy={treatmentBusy || undefined}
          aria-describedby={hintId}
          aria-labelledby={labelId}
          className="customer-sheet-segments"
          onKeyDown={handleKeyDown}
          ref={groupRef}
          role="radiogroup"
        >
          {treatmentOptions.map((option) => (
            <button
              aria-checked={position === option.value}
              className={clsx(
                "customer-sheet-segment",
                position === option.value && "is-checked",
              )}
              disabled={treatmentBusy}
              key={option.value}
              onClick={() => {
                if (treatmentWritesOnTap(conversation, option.value)) {
                  onChooseTreatment(option.value);
                }
              }}
              role="radio"
              tabIndex={tabStop === option.value ? 0 : -1}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="customer-sheet-hint" id={hintId}>
          {treatmentBusy ? "Salvando…" : treatmentHint(conversation, person)}
        </span>
        {treatmentError && (
          <p className="chat-sheet-error" role="alert">
            {treatmentError}
          </p>
        )}
      </section>
      <section aria-labelledby={actionsId} className="customer-sheet-actions">
        <span className="customer-sheet-label" id={actionsId}>
          Nesta conversa
        </span>
        <div className="customer-sheet-rows">
          {canTakeover && (
            <button
              className="chat-sheet-row"
              disabled={Boolean(takeoverBusy)}
              onClick={onTakeover}
              type="button"
            >
              <RowIcon>
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </RowIcon>
              <span>Assumir conversa</span>
            </button>
          )}
          <Link className="chat-sheet-row" href="/agenda/novo">
            <RowIcon>
              <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
              <path d="M4 10h16M8 3.5v4M16 3.5v4" />
            </RowIcon>
            <span>Criar agendamento</span>
          </Link>
          <button
            className="chat-sheet-row"
            disabled={closed}
            onClick={onResolve}
            type="button"
          >
            <RowIcon>
              <circle cx="12" cy="12" r="8" />
              <path d="M8.5 12.5l2.5 2.5 4.5-5" />
            </RowIcon>
            <span>Marcar como resolvida</span>
          </button>
        </div>
      </section>
    </>
  );
}
