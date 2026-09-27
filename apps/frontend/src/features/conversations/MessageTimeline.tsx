"use client";

import clsx from "clsx";
import Link from "next/link";

import type { ConversationEvent, Message } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";

import {
  formatBusinessTime,
  formatEventDayMonth,
  formatEventWeekday,
  formatExpiredThroughDate,
  formatMessageTime,
} from "./format";
import { MessageAttachmentView } from "./MessageAttachment";

type TimelineRow =
  | { instant: number; key: string; kind: "event"; event: ConversationEvent }
  | { instant: number; key: string; kind: "message"; message: Message };

/**
 * Intercala evento e bolha por instante (Goal070 §4). Com instante igual, o
 * evento vem antes da bolha, como no protótipo: a reserva antes de "Posso
 * confirmar?" e a criação antes de "Confirmado!".
 */
function buildTimelineRows(
  messages: Message[],
  events: ConversationEvent[],
): TimelineRow[] {
  const rows: TimelineRow[] = [
    ...events.map(
      (event): TimelineRow => ({
        event,
        instant: Date.parse(event.occurredAt),
        key: `event-${event.id}`,
        kind: "event",
      }),
    ),
    ...messages.map(
      (message): TimelineRow => ({
        instant: Date.parse(message.createdAt),
        key: `message-${message.id}`,
        kind: "message",
        message,
      }),
    ),
  ];
  rows.sort((a, b) => {
    if (a.instant !== b.instant) return a.instant - b.instant;
    if (a.kind === b.kind) return 0;
    return a.kind === "event" ? -1 : 1;
  });
  return rows;
}

/**
 * O histórico da conversa. Autoria discreta e honesta: o que a IA escreveu
 * aparece como escrito pela IA, nunca com nome de pessoa nem com o nome da
 * plataforma.
 *
 * `contentExpiredThrough` vem da marca durável do DTO (Goal023) — a
 * expiração nunca é inferida pela lista de mensagens vir vazia, que também
 * acontece numa conversa nova.
 */
export function MessageTimeline({
  businessName,
  businessTimezone,
  contentExpiredThrough,
  conversationId,
  events,
  messages,
  onResend,
  person,
  resendingId,
}: {
  businessName: string;
  businessTimezone: string;
  contentExpiredThrough: string | null;
  conversationId: string;
  events: ConversationEvent[];
  messages: Message[];
  onResend: (message: Message) => void;
  person: string;
  resendingId: string | null;
}) {
  const expiredDate = contentExpiredThrough
    ? formatExpiredThroughDate(contentExpiredThrough)
    : null;
  const rows = buildTimelineRows(messages, events);
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
      {expiredDate && (
        <div className="message-system" role="status">
          <Icon name="info" />
          <div>
            <strong>Mensagens antigas expiraram</strong>
            <span>
              Conteúdo anterior a {expiredDate} foi removido pela política de
              retenção. Mensagens mais recentes continuam abaixo.
            </span>
          </div>
        </div>
      )}
      {messages.length === 0 ? (
        <div className="message-system" role="status">
          <Icon name="info" />
          <div>
            {expiredDate ? (
              <>
                <strong>Nenhuma mensagem recente</strong>
                <span>
                  Todo o conteúdo desta conversa até {expiredDate} expirou pela
                  política de retenção. Novas mensagens aparecerão aqui
                  automaticamente.
                </span>
              </>
            ) : (
              <>
                <strong>Nenhuma mensagem registrada</strong>
                <span>Novas mensagens aparecerão aqui automaticamente.</span>
              </>
            )}
          </div>
        </div>
      ) : (
        rows.map((row) =>
          row.kind === "event" ? (
            <ConversationEventRow
              businessTimezone={businessTimezone}
              event={row.event}
              key={row.key}
            />
          ) : (
            <MessageBubble
              businessName={businessName}
              conversationId={conversationId}
              key={row.key}
              message={row.message}
              onResend={onResend}
              person={person}
              resending={resendingId === row.message.id}
            />
          ),
        )
      )}
    </div>
  );
}

const eventIcon: Record<ConversationEvent["type"], IconName> = {
  APPOINTMENT_CREATED: "calendar",
  HOLD_EXPIRED: "alert",
  HOLD_PLACED: "clock",
};

/**
 * Linha central do que a IA fez na agenda desta conversa (Goal070 §4): nunca
 * uma bolha, nunca com autoria — o fato vem só do ledger `AiToolCall`.
 */
function ConversationEventRow({
  businessTimezone,
  event,
}: {
  businessTimezone: string;
  event: ConversationEvent;
}) {
  const weekday = formatEventWeekday(event.date);
  return (
    <div className="conversation-event" role="status">
      <Icon name={eventIcon[event.type]} />
      <span>
        {event.type === "HOLD_PLACED" && (
          <>
            Horário reservado até{" "}
            {formatBusinessTime(event.holdExpiresAt, businessTimezone)} ·{" "}
            {weekday} {event.startTime}
          </>
        )}
        {event.type === "APPOINTMENT_CREATED" && (
          <>
            Agendamento criado · {weekday} {formatEventDayMonth(event.date)},{" "}
            {event.startTime} ·{" "}
            <Link
              href={`/agenda/agendamento?id=${encodeURIComponent(event.appointmentId)}`}
            >
              Ver
            </Link>
          </>
        )}
        {event.type === "HOLD_EXPIRED" && (
          <>
            Reserva de {weekday} {event.startTime} venceu sem confirmação
          </>
        )}
      </span>
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
