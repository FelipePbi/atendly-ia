"use client";

import clsx from "clsx";
import Link from "next/link";
import { Fragment, type ReactNode, useEffect, useRef } from "react";

import type { ConversationEvent, Message } from "@/data";
import { Icon, type IconName } from "@/shared/icons/Icon";

import {
  formatBusinessTime,
  formatEventDayMonth,
  formatEventWeekday,
  formatExpiredThroughDate,
  formatMessageTime,
  formatTimelineDay,
} from "./format";
import { MessageAttachmentView } from "./MessageAttachment";

type TimelineRow =
  | { instant: number; key: string; kind: "event"; event: ConversationEvent }
  | { instant: number; key: string; kind: "message"; message: Message }
  | { instant: number; key: string; kind: "takeover" }
  | { instant: number; key: string; kind: "notice"; text: string };

/**
 * Intercala evento e bolha por instante (Goal070 §4). Com instante igual, o
 * evento vem antes da bolha, como no protótipo: a reserva antes de "Posso
 * confirmar?" e a criação antes de "Confirmado!". A assunção pela
 * profissional (`session.humanHandlingSince`) entra no mesmo fio, no seu
 * instante (quadro K3).
 */
function buildTimelineRows(
  messages: Message[],
  events: ConversationEvent[],
  humanHandlingSince: string | null,
): TimelineRow[] {
  const takeoverInstant = humanHandlingSince
    ? Date.parse(humanHandlingSince)
    : Number.NaN;
  const rows: TimelineRow[] = [
    ...events.map((event): TimelineRow => ({
      event,
      instant: Date.parse(event.occurredAt),
      key: `event-${event.id}`,
      kind: "event",
    })),
    ...messages.map((message): TimelineRow => ({
      instant: Date.parse(message.createdAt),
      key: `message-${message.id}`,
      kind: "message",
      message,
    })),
    ...(Number.isFinite(takeoverInstant)
      ? [
          {
            instant: takeoverInstant,
            key: "takeover",
            kind: "takeover",
          } satisfies TimelineRow,
        ]
      : []),
  ];
  rows.sort((a, b) => {
    if (a.instant !== b.instant) return a.instant - b.instant;
    if (a.kind === b.kind) return 0;
    return a.kind === "message" ? 1 : -1;
  });
  return rows;
}

/**
 * Onde entra a linha do motivo da espera (quadro K2). O contrato não diz
 * quando a IA passou a conversa: imagem recebida fica logo depois da última
 * imagem que chegou, que é o que a pausou; os outros motivos ficam no fim.
 */
function placeNotice(
  rows: TimelineRow[],
  notice: { anchorImage: boolean; text: string } | null,
): TimelineRow[] {
  if (!notice) return rows;
  const row: TimelineRow = {
    instant: Number.NaN,
    key: "notice",
    kind: "notice",
    text: notice.text,
  };
  if (notice.anchorImage) {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const candidate = rows[index];
      if (
        candidate.kind === "message" &&
        candidate.message.direction === "INBOUND" &&
        candidate.message.attachment?.kind === "IMAGE"
      ) {
        return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)];
      }
    }
  }
  return [...rows, row];
}

/**
 * O histórico da conversa, como nos quadros K1 a K4. Autoria discreta e
 * honesta: o que a IA escreveu aparece como escrito pela IA, nunca com nome de
 * pessoa nem com o nome da plataforma.
 *
 * `contentExpiredThrough` vem da marca durável do DTO (Goal023) — a
 * expiração nunca é inferida pela lista de mensagens vir vazia, que também
 * acontece numa conversa nova.
 *
 * A área rola sozinha para a mensagem mais recente quando o histórico não
 * cabe; quando cabe, começa no topo, com o dia, como em K2 e K4.
 */
export function MessageTimeline({
  businessTimezone,
  contentExpiredThrough,
  conversationId,
  events,
  footer,
  humanHandlingSince,
  messages,
  notice,
  onResend,
  person,
  resendingId,
}: {
  businessTimezone: string;
  contentExpiredThrough: string | null;
  conversationId: string;
  events: ConversationEvent[];
  /** Nota fixa no pé da área (a do contato ignorado, quadro K4). */
  footer?: ReactNode;
  humanHandlingSince: string | null;
  messages: Message[];
  notice: { anchorImage: boolean; text: string } | null;
  onResend: (message: Message) => void;
  person: string;
  resendingId: string | null;
}) {
  const expiredDate = contentExpiredThrough
    ? formatExpiredThroughDate(contentExpiredThrough)
    : null;
  const rows = placeNotice(
    buildTimelineRows(messages, events, humanHandlingSince),
    messages.length > 0 ? notice : null,
  );
  const logRef = useRef<HTMLDivElement>(null);
  // Fica preso ao fim enquanto a pessoa não rolou para cima: uma linha nova,
  // os eventos que chegam depois e a área que muda de altura (a casca aplica
  // a altura do chat depois da primeira pintura) mantêm a última mensagem à
  // vista.
  const pinned = useRef(true);
  const rowCount = rows.length;
  const lastKey = rows.at(-1)?.key ?? "";

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    const pin = () => {
      if (pinned.current) node.scrollTop = node.scrollHeight;
    };
    pin();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(pin);
    observer.observe(node);
    return () => observer.disconnect();
  }, [lastKey, rowCount]);

  let previousDay = "";
  return (
    <div
      aria-label={`Histórico da conversa com ${person}`}
      className="message-timeline"
      onScroll={(event) => {
        const node = event.currentTarget;
        pinned.current =
          node.scrollHeight - node.scrollTop - node.clientHeight < 32;
      }}
      ref={logRef}
      role="log"
      tabIndex={0}
    >
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
        rows.map((row) => {
          const day = Number.isFinite(row.instant)
            ? formatTimelineDay(
                new Date(row.instant).toISOString(),
                businessTimezone,
              )
            : previousDay;
          const newDay = day !== previousDay;
          previousDay = day;
          return (
            <Fragment key={row.key}>
              {newDay && <div className="message-day">{day}</div>}
              <TimelineItem
                businessTimezone={businessTimezone}
                conversationId={conversationId}
                onResend={onResend}
                resendingId={resendingId}
                row={row}
              />
            </Fragment>
          );
        })
      )}
      {footer && (
        <>
          <div aria-hidden="true" className="message-timeline-spacer" />
          {footer}
        </>
      )}
    </div>
  );
}

function TimelineItem({
  businessTimezone,
  conversationId,
  onResend,
  resendingId,
  row,
}: {
  businessTimezone: string;
  conversationId: string;
  onResend: (message: Message) => void;
  resendingId: string | null;
  row: TimelineRow;
}) {
  if (row.kind === "event") {
    return (
      <ConversationEventRow
        businessTimezone={businessTimezone}
        event={row.event}
      />
    );
  }
  if (row.kind === "takeover") {
    return (
      <EventLine glyph={<EventGlyph name="person" />}>
        Você assumiu a conversa ·{" "}
        {formatMessageTime(new Date(row.instant).toISOString())}
      </EventLine>
    );
  }
  if (row.kind === "notice") {
    return (
      <EventLine
        className="is-waiting"
        glyph={<span aria-hidden="true" className="conversation-event-dot" />}
      >
        {row.text}
      </EventLine>
    );
  }
  return (
    <MessageBubble
      conversationId={conversationId}
      message={row.message}
      onResend={onResend}
      resending={resendingId === row.message.id}
    />
  );
}

/**
 * A linha discreta do quadro: traço, ícone e texto, traço. Nunca bolha, nunca
 * autoria; o texto não depende de cor para dizer o que aconteceu.
 */
function EventLine({
  children,
  className,
  glyph,
}: {
  children: ReactNode;
  className?: string;
  glyph: ReactNode;
}) {
  return (
    <div className={clsx("conversation-event", className)} role="status">
      <span className="conversation-event-label">
        {glyph}
        <span>{children}</span>
      </span>
    </div>
  );
}

/** Os traços dos ícones das linhas de evento, os mesmos do quadro. */
function EventGlyph({
  name,
}: {
  name: "calendar" | "clock" | "expired" | "person";
}) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={name === "person" ? 2.5 : 2.25}
      viewBox="0 0 24 24"
      width="12"
    >
      {name === "calendar" && (
        <>
          <rect height="14.5" rx="2.5" width="16" x="4" y="5.5" />
          <path d="M4 10h16M8 3.5v4M16 3.5v4" />
        </>
      )}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.5l3 2" />
        </>
      )}
      {name === "expired" && (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M6.5 6.5l11 11" />
        </>
      )}
      {name === "person" && (
        <>
          <circle cx="12" cy="8.5" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </>
      )}
    </svg>
  );
}

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
    <EventLine
      className={
        event.type === "APPOINTMENT_CREATED" ? "is-created" : undefined
      }
      glyph={
        <EventGlyph
          name={
            event.type === "APPOINTMENT_CREATED"
              ? "calendar"
              : event.type === "HOLD_PLACED"
                ? "clock"
                : "expired"
          }
        />
      }
    >
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
    </EventLine>
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
  conversationId,
  message,
  onResend,
  resending,
}: {
  conversationId: string;
  message: Message;
  onResend: (message: Message) => void;
  resending: boolean;
}) {
  const outgoing = message.direction === "OUTBOUND";
  const source = message.source;
  const ai = source === "AI";
  const time = formatMessageTime(message.createdAt);
  const meta = ai ? `IA · ${time}` : outgoing ? `Você · ${time}` : time;
  const deliveryState = message.deliveryState;
  const attachmentKind = message.attachment?.kind;
  return (
    <div
      className={clsx(
        "message-group",
        outgoing && "is-outgoing",
        ai && "is-ai",
        source === "OWNER" && "is-owner",
        source === "CUSTOMER" && "is-customer",
        attachmentKind === "AUDIO" && "is-audio",
        attachmentKind === "IMAGE" && "is-image",
      )}
    >
      <div className="message-bubble">
        {message.body && <span className="message-text">{message.body}</span>}
        {message.attachment && (
          <MessageAttachmentView
            attachment={message.attachment}
            conversationId={conversationId}
            messageId={message.id}
          />
        )}
      </div>
      <span className="message-meta">
        {ai && <span aria-hidden="true" className="message-meta-dot" />}
        {outgoing && !ai && (
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
        )}
        {meta}
      </span>
      {outgoing && deliveryState && deliveryState !== "SENT" && (
        <DeliveryBadge
          detail={message.deliveryDetail}
          onResend={() => onResend(message)}
          resending={resending}
          state={deliveryState}
        />
      )}
    </div>
  );
}
