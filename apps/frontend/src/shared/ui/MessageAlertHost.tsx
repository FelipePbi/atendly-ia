"use client";

import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MessageKind } from "@/data";
import { formatInboxPhone, initials } from "@/features/conversations/format";
import { Icon } from "@/shared/icons/Icon";
import {
  MESSAGE_ALERT_DURATION_MS,
  type MessageAlert,
  useConversationAlerts,
} from "@/shared/runtime/conversationAlerts";

/** Quanto dura a saída do aviso antes de ele sair da árvore. */
export const MESSAGE_ALERT_EXIT_MS = 180;

const kindLabel: Partial<Record<MessageKind, string>> = {
  AUDIO: "Áudio",
  DOCUMENT: "Documento",
  IMAGE: "Imagem",
  STICKER: "Figurinha",
  VIDEO: "Vídeo",
};

/** A linha do aviso: o texto da mensagem, ou o tipo da mídia sem legenda. */
export function messageAlertPreview(alert: MessageAlert): string {
  return alert.preview || kindLabel[alert.kind] || "Mensagem";
}

export function messageAlertName(alert: MessageAlert): string {
  return (
    alert.customerName?.trim() || formatInboxPhone(alert.externalContactId)
  );
}

/**
 * Avisos de mensagem nova da casca (D-195), no jeito do WhatsApp: descem do
 * topo com o nome (ou telefone) e a primeira linha da mensagem; tocar abre a
 * conversa. Somem sozinhos em 5 s — a contagem pausa enquanto o ponteiro ou
 * o foco estão no aviso — e têm botão de fechar. A região existe sempre, vazia,
 * para o leitor de tela anunciar o que entra nela.
 */
export function MessageAlertHost() {
  const alerts = useConversationAlerts();
  if (!alerts) return null;
  return (
    <MessageAlertStack alerts={alerts.alerts} onDismiss={alerts.dismiss} />
  );
}

export function MessageAlertStack({
  alerts,
  onDismiss,
}: {
  alerts: readonly MessageAlert[];
  onDismiss: (conversationId: string) => void;
}) {
  return (
    <section
      aria-label="Mensagens novas"
      aria-live="polite"
      className="message-alerts"
    >
      {alerts.map((alert) => (
        <MessageAlertCard
          alert={alert}
          key={`${alert.conversationId}:${alert.messageId}`}
          onDismiss={onDismiss}
        />
      ))}
    </section>
  );
}

function MessageAlertCard({
  alert,
  onDismiss,
}: {
  alert: MessageAlert;
  onDismiss: (conversationId: string) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const exitTimer = useRef<number | undefined>(undefined);
  const name = messageAlertName(alert);
  const preview = messageAlertPreview(alert);

  const leave = useCallback(() => {
    setLeaving(true);
    window.clearTimeout(exitTimer.current);
    exitTimer.current = window.setTimeout(
      () => onDismiss(alert.conversationId),
      MESSAGE_ALERT_EXIT_MS,
    );
  }, [alert.conversationId, onDismiss]);

  useEffect(() => {
    if (paused || leaving) return;
    const timer = window.setTimeout(leave, MESSAGE_ALERT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [leave, leaving, paused]);

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  return (
    <div
      className={clsx("message-alert", leaving && "is-leaving")}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link
        className="message-alert-link"
        href={`/conversas/${encodeURIComponent(alert.conversationId)}`}
        onClick={() => onDismiss(alert.conversationId)}
      >
        <span aria-hidden="true" className="message-alert-avatar">
          {alert.customerName?.trim() ? (
            initials(name)
          ) : (
            <Icon name="user" />
          )}
        </span>
        <span className="message-alert-text">
          <span className="message-alert-eyebrow">Nova mensagem</span>
          <strong className="message-alert-name">{name}</strong>
          <span className="message-alert-preview">{preview}</span>
        </span>
      </Link>
      <button
        aria-label={`Fechar aviso de ${name}`}
        className="message-alert-close"
        onClick={leave}
        type="button"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}
