"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import type { UnreadMessagePreview } from "@/data";
import { createChangeSignal } from "@/data/services/changeSignal";

import { getProductServices } from "./ProductRuntime";

/**
 * Conversas não lidas na casca (D-195): o contador do item "Conversas" da
 * navegação e o aviso de mensagem nova no topo da tela.
 *
 * Um único poller de `GET /v1/conversations/unread-summary` por casca, mais
 * curto que o de `/v1/status` (45 s) porque o aviso só tem valor enquanto a
 * mensagem é nova. Aba escondida não consulta; voltar a ela consulta na hora.
 * Sem tempo real: o resumo diz qual é a última mensagem não lida de cada
 * conversa, e o aviso nasce da comparação com a leitura anterior.
 */
export const UNREAD_POLL_MS = 15_000;
/** Quanto o aviso de mensagem nova fica na tela. */
export const MESSAGE_ALERT_DURATION_MS = 5_000;
/** Mais que isso empilhado é ruído: o mais antigo sai. */
export const MAX_MESSAGE_ALERTS = 3;

export type MessageAlert = UnreadMessagePreview;

export type ConversationAlertsValue = {
  /** Mensagens novas a avisar, a mais nova primeiro. */
  alerts: MessageAlert[];
  dismiss: (conversationId: string) => void;
  /** `null` enquanto a primeira leitura não respondeu, ou se falhou. */
  unreadConversations: number | null;
};

/**
 * Aviso de que a profissional acabou de ver uma conversa: o contador relê o
 * resumo na hora, sem esperar o próximo ciclo.
 */
export const conversationReadSignal = createChangeSignal();

/** A conversa aberta na rota (`/conversas/<id>`), ou `null`. */
export function openConversationId(pathname: string | null): string | null {
  const match = /^\/conversas\/([^/?#]+)/u.exec(pathname ?? "");
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * O que avisar desta leitura: só o que chegou depois da leitura anterior
 * (`since`), nunca a conversa que já está aberta na tela. A primeira leitura
 * (`since === null`) é a base: o que já estava lá não é novidade.
 */
export function newMessagesToAlert(
  recent: readonly UnreadMessagePreview[],
  since: string | null,
  openId: string | null,
): UnreadMessagePreview[] {
  if (since === null) return [];
  const sinceMs = new Date(since).getTime();
  return recent.filter(
    (item) =>
      new Date(item.createdAt).getTime() > sinceMs &&
      item.conversationId !== openId,
  );
}

/** Instante da mensagem mais nova da leitura, ou o anterior se nada é mais novo. */
function latestOf(
  recent: readonly UnreadMessagePreview[],
  previous: string | null,
): string {
  let latest = previous ?? new Date(0).toISOString();
  for (const item of recent) {
    if (new Date(item.createdAt).getTime() > new Date(latest).getTime())
      latest = item.createdAt;
  }
  return latest;
}

/** Junta avisos novos na pilha: um por conversa, o mais novo em cima. */
export function mergeAlerts(
  current: readonly MessageAlert[],
  incoming: readonly MessageAlert[],
): MessageAlert[] {
  const incomingIds = new Set(incoming.map((item) => item.conversationId));
  return [
    ...incoming,
    ...current.filter((item) => !incomingIds.has(item.conversationId)),
  ].slice(0, MAX_MESSAGE_ALERTS);
}

function useConversationAlertsPolling(): ConversationAlertsValue {
  const pathname = usePathname();
  const openId = openConversationId(pathname);
  const openIdRef = useRef(openId);
  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);

  const [unreadConversations, setUnreadConversations] = useState<
    number | null
  >(null);
  const [alerts, setAlerts] = useState<MessageAlert[]>([]);
  const since = useRef<string | null>(null);

  // Abrir a conversa do aviso tira o aviso dela da pilha (ajuste no render,
  // não em efeito: a troca de rota já é o evento).
  const [seenOpenId, setSeenOpenId] = useState(openId);
  if (seenOpenId !== openId) {
    setSeenOpenId(openId);
    if (openId)
      setAlerts((current) =>
        current.filter((item) => item.conversationId !== openId),
      );
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let inFlight = false;
    // Pedido que chegou durante uma leitura (ex.: a conversa acabou de ser
    // lida): roda logo depois dela, em vez de se perder.
    let again = false;

    async function load(): Promise<void> {
      if (document.visibilityState === "hidden") return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        // `Promise.resolve().then` também transforma em recusa um registro de
        // serviços sem a leitura (dublê de teste, sessão saindo).
        const summary = await Promise.resolve().then(() =>
          getProductServices().conversations.unreadSummary(controller.signal),
        );
        if (cancelled) return;
        setUnreadConversations(summary.unreadConversations);
        const fresh = newMessagesToAlert(
          summary.recent,
          since.current,
          openIdRef.current,
        );
        since.current = latestOf(summary.recent, since.current);
        if (fresh.length > 0)
          setAlerts((current) => mergeAlerts(current, fresh));
      } catch {
        if (cancelled || controller.signal.aborted) return;
        // Sem leitura, sem número: nunca um zero que ninguém calculou.
        setUnreadConversations(null);
      } finally {
        inFlight = false;
        if (again && !cancelled) {
          again = false;
          void load();
        }
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const interval = window.setInterval(() => void load(), UNREAD_POLL_MS);
    window.addEventListener("focus", onVisibility);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = conversationReadSignal.subscribe(() => void load());
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onVisibility);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, []);

  const dismiss = useCallback((conversationId: string) => {
    setAlerts((current) =>
      current.filter((item) => item.conversationId !== conversationId),
    );
  }, []);

  return { alerts, dismiss, unreadConversations };
}

const ConversationAlertsContext =
  createContext<ConversationAlertsValue | null>(null);

/** Montado uma vez pela casca (`AppShell`), como o `SystemStatusProvider`. */
export function ConversationAlertsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useConversationAlertsPolling();
  return (
    <ConversationAlertsContext.Provider value={value}>
      {children}
    </ConversationAlertsContext.Provider>
  );
}

/** O estado da casca, ou `null` fora dela (telas montadas sozinhas). */
export function useConversationAlerts(): ConversationAlertsValue | null {
  return useContext(ConversationAlertsContext);
}
