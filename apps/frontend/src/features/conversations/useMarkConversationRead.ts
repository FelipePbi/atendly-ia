"use client";

import { useEffect, useRef, useState } from "react";

import type { Conversation, Message } from "@/data";
import { conversationReadSignal } from "@/shared/runtime/conversationAlerts";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

/** Instante da mensagem mais nova da lista, ou `null` sem mensagens. */
export function newestMessageAt(messages: readonly Message[]): string | null {
  let newest: string | null = null;
  for (const message of messages) {
    if (
      newest === null ||
      new Date(message.createdAt).getTime() > new Date(newest).getTime()
    )
      newest = message.createdAt;
  }
  return newest;
}

/**
 * Conversa aberta e à vista é conversa lida (D-195): quando a leitura da
 * conversa diz que há mensagem não lida, marca como vista até a mensagem mais
 * nova que a tela mostra — nunca além dela, para não "ler" o que chegou depois
 * da última atualização. Aba escondida não marca; voltar a ela marca. Depois
 * da marcação o contador da casca relê o resumo na hora.
 */
export function useMarkConversationRead(
  conversation: Conversation | null,
  messages: readonly Message[],
  onRead: (conversationId: string, unreadCount: number) => void,
): void {
  const [visibleTick, setVisibleTick] = useState(0);
  const sent = useRef<string | null>(null);
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible")
        setVisibleTick((value) => value + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const id = conversation?.id ?? null;
  const unread = conversation?.unreadCount ?? 0;
  const readThrough = newestMessageAt(messages);

  useEffect(() => {
    if (!id || unread <= 0 || !readThrough) return;
    if (document.visibilityState === "hidden") return;
    const key = `${id}|${readThrough}`;
    if (sent.current === key) return;
    sent.current = key;
    Promise.resolve()
      .then(() => getProductServices().conversations.markRead(id, readThrough))
      .then((result) => {
        onReadRef.current(id, result.unreadCount);
        conversationReadSignal.notify();
      })
      .catch(() => {
        // Sem marcação, a próxima atualização da conversa tenta de novo.
        if (sent.current === key) sent.current = null;
      });
  }, [id, readThrough, unread, visibleTick]);
}
