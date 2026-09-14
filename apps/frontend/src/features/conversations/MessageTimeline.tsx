"use client";

import clsx from "clsx";

import type { Message } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";

import { formatMessageTime } from "./format";
import { MessageAttachmentView } from "./MessageAttachment";

/**
 * O histórico da conversa. Autoria discreta e honesta: o que a IA escreveu
 * aparece como escrito pela IA, nunca com nome de pessoa nem com o nome da
 * plataforma.
 */
export function MessageTimeline({
  businessName,
  conversationId,
  messages,
  onResend,
  person,
  resendingId,
}: {
  businessName: string;
  conversationId: string;
  messages: Message[];
  onResend: (message: Message) => void;
  person: string;
  resendingId: string | null;
}) {
  return (
    <div
      aria-label={`Histórico da conversa com ${person}`}
      className="message-timeline"
      role="log"
      tabIndex={0}
    >
      <div className="message-date">
        <span>Histórico</span>
      </div>
      {messages.length === 0 ? (
        <div className="message-system" role="status">
          <Icon name="info" />
          <div>
            <strong>Nenhuma mensagem registrada</strong>
            <span>Novas mensagens aparecerão aqui automaticamente.</span>
          </div>
        </div>
      ) : (
        messages.map((message) => (
          <MessageBubble
            businessName={businessName}
            conversationId={conversationId}
            key={message.id}
            message={message}
            onResend={onResend}
            person={person}
            resending={resendingId === message.id}
          />
        ))
      )}
    </div>
  );
}

const deliveryCopy: Record<
  NonNullable<Message["deliveryState"]>,
  { className: string; icon: IconName; label: string }
> = {
  FAILED: { className: "is-failed", icon: "alert", label: "Não entregue" },
  PENDING: { className: "is-pending", icon: "clock", label: "Enviando…" },
  SENT: { className: "is-sent", icon: "check", label: "Enviado" },
  UNKNOWN: { className: "is-unknown", icon: "info", label: "Não confirmado" },
};

function DeliveryBadge({
  detail,
  onResend,
  resending,
  state,
}: {
  detail: string | null | undefined;
  onResend: () => void;
  resending: boolean;
  state: NonNullable<Message["deliveryState"]>;
}) {
  const copy = deliveryCopy[state];
  return (
    <span className={clsx("message-delivery", copy.className)} role="status">
      <Icon name={copy.icon} />
      <span>
        {copy.label}
        {detail ? ` · ${detail}` : ""}
      </span>
      {state === "FAILED" && (
        <button
          className="message-delivery-retry"
          disabled={resending}
          onClick={onResend}
          type="button"
        >
          {resending ? "Reenviando…" : "Tentar reenviar"}
        </button>
      )}
    </span>
  );
}

export function MessageBubble({
  businessName,
  conversationId,
  message,
  onResend,
  person,
  resending,
}: {
  businessName: string;
  conversationId: string;
  message: Message;
  onResend: (message: Message) => void;
  person: string;
  resending: boolean;
}) {
  const outgoing = message.direction === "OUTBOUND";
  const source = message.source;
  const ai = source === "AI";
  const sender = ai ? `${businessName} · IA` : outgoing ? "Você" : person;
  return (
    <div
      className={clsx(
        "message-group",
        outgoing && "is-outgoing",
        ai && "is-ai",
        source === "OWNER" && "is-owner",
        source === "CUSTOMER" && "is-customer",
      )}
    >
      <span className="message-sender">{sender}</span>
      <div className="message-bubble">
        {message.body}
        {message.attachment && (
          <MessageAttachmentView
            attachment={message.attachment}
            conversationId={conversationId}
            messageId={message.id}
          />
        )}
      </div>
      <span className="message-meta">
        {formatMessageTime(message.createdAt)}
        {ai
          ? " · resposta automática"
          : source === "OWNER"
            ? " · atendimento humano"
            : ""}
      </span>
      {outgoing && message.deliveryState && (
        <DeliveryBadge
          detail={message.deliveryDetail}
          onResend={() => onResend(message)}
          resending={resending}
          state={message.deliveryState}
        />
      )}
    </div>
  );
}
