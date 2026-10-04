"use client";

import clsx from "clsx";
import Link from "next/link";

import type { Conversation } from "@/data";

import { conversationState, conversationStateView } from "./conversationState";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  formatInboxPhone,
  formatInboxTime,
  formatWaitingTime,
  initials,
  waitingReasonLabel,
} from "./format";

/**
 * Uma linha da conversa, a do quadro de Conversas do protótipo: nome, última
 * mensagem, horário e, quando há o que dizer, o estado. Ao lado do chat
 * (Goal114) a linha da conversa aberta vem marcada com `aria-current`. Não há
 * contador de não lidas: o contrato devolve `unreadCount` zero fixo e a tela
 * não afirma o que nenhuma camada calcula.
 */
export function ConversationRow({
  conversation,
  selected = false,
  timezone = DEFAULT_BUSINESS_TIMEZONE,
}: {
  conversation: Conversation;
  selected?: boolean;
  timezone?: string;
}) {
  return (
    <InboxRow
      conversation={conversation}
      selected={selected}
      timezone={timezone}
    />
  );
}

function InboxRow({
  conversation,
  selected,
  timezone,
}: {
  conversation: Conversation;
  selected: boolean;
  timezone: string;
}) {
  const state = conversationState(conversation);
  const view = conversationStateView(state);
  const name = conversation.customerName?.trim();
  const label = name || formatInboxPhone(conversation.externalContactId);
  const waiting = state === "waiting-you";
  const reason = waiting
    ? waitingReasonLabel(conversation.handoffReason)
    : null;
  const tone = waiting ? "is-waiting" : state === "ai-handling" ? "is-ai" : "";
  const hasPill =
    waiting ||
    state === "ai-handling" ||
    state === "you-handling" ||
    state === "ai-unstable";
  const message = conversation.lastMessage;
  const prefix =
    message?.direction === "OUTBOUND" && message.source === "OWNER"
      ? "Você: "
      : "";

  return (
    <Link
      className={clsx(
        "conversation-row",
        "is-inbox",
        tone,
        selected && "is-selected",
      )}
      aria-current={selected ? "page" : undefined}
      href={`/conversas/${encodeURIComponent(conversation.id)}`}
    >
      <span aria-hidden="true" className="conversation-row-avatar">
        {name ? (
          initials(name)
        ) : (
          <svg
            fill="none"
            height="20"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            viewBox="0 0 24 24"
            width="20"
          >
            <circle cx="12" cy="8.5" r="3.5" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
        )}
      </span>
      <span className="conversation-row-main">
        <span className="conversation-row-top">
          <strong
            className={clsx("conversation-row-name", !name && "is-phone")}
          >
            {label}
          </strong>
          <time
            className={clsx("conversation-row-time", waiting && "is-waiting")}
            dateTime={conversation.updatedAt}
          >
            {waiting
              ? formatWaitingTime(conversation.updatedAt)
              : formatInboxTime(conversation.updatedAt, timezone)}
          </time>
        </span>
        <span className="conversation-row-preview">
          {message?.body ? `${prefix}${message.body}` : "Sem mensagens"}
        </span>
        {hasPill && (
          <span
            className={clsx(
              "conversation-row-pill",
              waiting && "is-waiting",
              state === "ai-handling" && "is-ai",
              state === "you-handling" && "is-human",
              state === "ai-unstable" && "is-error",
            )}
          >
            {state === "you-handling" ? (
              <svg
                aria-hidden="true"
                fill="none"
                height="11"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
                width="11"
              >
                <circle cx="12" cy="8.5" r="3.5" />
                <path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            ) : (
              <span aria-hidden="true" className="conversation-row-pill-dot" />
            )}
            <span>
              <span>{view.label}</span>
              {reason && <span> · {reason}</span>}
            </span>
          </span>
        )}
        {!hasPill && <span className="sr-only">{view.label}</span>}
        {conversation.ignored && (
          <span className="conversation-row-ignored">
            <svg
              aria-hidden="true"
              fill="none"
              height="11"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              width="11"
            >
              <circle cx="12" cy="12" r="8" />
              <path d="M6.5 6.5l11 11" />
            </svg>
            A IA nunca responde este contato
          </span>
        )}
      </span>
    </Link>
  );
}
