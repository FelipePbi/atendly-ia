"use client";

import { useEffect, useId, useRef, useState } from "react";

import { prefersReducedMotion } from "@/shared/motion/reducedMotion";

/** Pausa entre uma mensagem e o próximo "digitando…" na prévia. */
const PREVIEW_GAP_MS = 450;
/** Antes do primeiro "digitando…", para a tela abrir parada. */
const PREVIEW_START_MS = 350;

/**
 * "digitando…" da prévia: a mesma proporção do envio, mais curta, para a
 * sequência inteira caber em poucos segundos.
 */
export function previewTypingMs(text: string): number {
  return Math.min(1400, Math.max(600, Math.round(text.length * 18)));
}

/**
 * Tela de celular com a conversa como a cliente a vê no WhatsApp (D-208): o
 * nome do negócio no topo e as mensagens chegando em ordem, cada uma depois
 * de um "digitando…". Com `prefers-reduced-motion`, todas aparecem de uma
 * vez, sem "digitando…" nem deslocamento. O texto é sempre texto: a lista é
 * um `role="log"` que anuncia cada mensagem enquanto toca.
 */
export function ChatPhone({
  bubbles,
  businessName,
  time,
}: {
  /** As mensagens, uma por balão, na ordem em que chegam. */
  bubbles: readonly string[];
  businessName: string;
  /** Horário mostrado em cada balão (`HH:MM`). */
  time: string;
}) {
  const [run, setRun] = useState(0);
  return (
    <div className="chat-phone-wrap">
      {/* Cada "Repetir" (e cada conversa nova) monta a sequência do zero. */}
      <ChatPhonePlayback
        bubbles={bubbles}
        businessName={businessName}
        key={`${run}:${bubbles.join("\u0000")}`}
        time={time}
      />
      <button
        className="btn btn-secondary chat-phone-replay"
        onClick={() => setRun((value) => value + 1)}
        type="button"
      >
        Repetir
      </button>
    </div>
  );
}

function ChatPhonePlayback({
  bubbles,
  businessName,
  time,
}: {
  bubbles: readonly string[];
  businessName: string;
  time: string;
}) {
  const titleId = useId();
  const [reduced] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(reduced ? bubbles.length : 0);
  const [typing, setTyping] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A mensagem nova fica à vista, como no celular.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [shown, typing]);

  useEffect(() => {
    if (reduced) return;
    const timers: number[] = [];
    let at = PREVIEW_START_MS;
    bubbles.forEach((text, index) => {
      timers.push(window.setTimeout(() => setTyping(true), at));
      at += previewTypingMs(text);
      timers.push(
        window.setTimeout(() => {
          setTyping(false);
          setShown(index + 1);
        }, at),
      );
      at += PREVIEW_GAP_MS;
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [bubbles, reduced]);

  const playing = !reduced && shown < bubbles.length;
  const initial = businessName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div aria-labelledby={titleId} className="chat-phone" role="group">
      <div className="chat-phone-header">
        <span aria-hidden="true" className="chat-phone-avatar">
          {initial}
        </span>
        <span className="chat-phone-contact">
          <strong id={titleId}>{businessName}</strong>
          <span className="chat-phone-status">
            {typing ? "digitando…" : "online"}
          </span>
        </span>
      </div>
      <div
        aria-busy={playing}
        aria-label={`Mensagens de ${businessName}`}
        aria-live={playing ? "polite" : "off"}
        className="chat-phone-body"
        ref={bodyRef}
        role="log"
      >
        {bubbles.slice(0, shown).map((text, index) => (
          <div className="chat-phone-bubble" key={index}>
            <span className="chat-phone-text">{text}</span>
            <span className="chat-phone-time">{time}</span>
          </div>
        ))}
        {typing && (
          <div aria-hidden="true" className="chat-phone-typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

/** As mensagens em balões, sem animação: as prévias das telas. */
export function MessageBubbles({
  bubbleClassName,
  bubbles,
  label,
}: {
  bubbleClassName: string;
  bubbles: readonly string[];
  /** Nome acessível da lista quando há mais de uma mensagem. */
  label?: string;
}) {
  if (bubbles.length === 1) {
    return <div className={bubbleClassName}>{bubbles[0]}</div>;
  }
  return (
    <ol aria-label={label} className="message-parts">
      {bubbles.map((text, index) => (
        <li className={bubbleClassName} key={index}>
          {text}
        </li>
      ))}
    </ol>
  );
}
