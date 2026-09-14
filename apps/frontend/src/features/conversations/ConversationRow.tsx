"use client";

import clsx from "clsx";
import Link from "next/link";

import type { Conversation } from "@/data";
import { Icon } from "@/shared/icons/Icon";

import {
  conversationState,
  conversationStateView,
  needsAttention,
} from "./conversationState";
import { conversationLabel, formatRelativeTime, initials } from "./format";

/**
 * Uma linha da inbox: nome, última mensagem, horário, estado e destaque de
 * handoff — o que o vault pede em `03-UX-UI/04-Especificacao-das-Telas.md`.
 * Não há contador de não lidas: o contrato devolve `unreadCount` zero fixo e a
 * tela não afirma o que nenhuma camada calcula.
 */
export function ConversationRow({
  compact = false,
  conversation,
  selected = false,
}: {
  compact?: boolean;
  conversation: Conversation;
  selected?: boolean;
}) {
  const state = conversationState(conversation);
  const view = conversationStateView(state);
  const label = conversationLabel(conversation);
  return (
    <Link
      className={clsx(
        "conversation-row",
        needsAttention(state) && "is-attention",
        selected && "is-selected",
      )}
      href={`/conversas/${encodeURIComponent(conversation.id)}`}
    >
      <span className="conversation-row-avatar">
        <span className="avatar">{initials(label)}</span>
      </span>
      <span className="conversation-row-main">
        <span className="conversation-row-title">
          <strong>{label}</strong>
        </span>
        <span className="conversation-row-preview">
          {conversation.lastMessage?.body || "Sem mensagens"}
        </span>
        <span className="conversation-row-signals">
          <span
            className={clsx(
              "badge",
              (state === "ai-active" || state === "ai-handling") && "badge-ai",
              needsAttention(state) && "badge-attention",
              state === "you-handling" && "badge-success",
            )}
          >
            <Icon name={view.icon} />
            {view.label}
          </span>
        </span>
      </span>
      <time className="conversation-row-time" dateTime={conversation.updatedAt}>
        {formatRelativeTime(conversation.updatedAt)}
      </time>
      {compact && <span className="sr-only">Abrir conversa</span>}
    </Link>
  );
}
