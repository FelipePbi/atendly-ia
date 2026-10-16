"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type {
  AiStateValue,
  NotificationSummary,
  SystemStatus,
  WhatsAppStatusValue,
} from "@/data";

import { getProductServices } from "./ProductRuntime";

export type StatusFetchPhase = "error" | "loaded" | "loading";
export type StatusView = "active" | "loading" | "off" | "pending" | "unknown";

/**
 * Quatro estados visuais, nunca um default conectado: enquanto a primeira
 * resposta de `GET /v1/status` não chega, o estado é "loading"; se a
 * requisição falhar, é "unknown" — nunca "active". Só uma leitura honesta do
 * BFF (Goal014/WU-02) pode produzir "active".
 */
export function whatsappStatusView(
  phase: StatusFetchPhase,
  status?: WhatsAppStatusValue,
): StatusView {
  if (phase === "loading") return "loading";
  if (phase === "error") return "unknown";
  if (status === "CONNECTED") return "active";
  if (status === "UNKNOWN") return "unknown";
  return "off";
}

/**
 * Mesmo princípio para a IA, com uma quinta apresentação própria: `PENDING`
 * (desejado ligado, IA ainda não confirma) deixa de cair sob "off" — resíduo
 * do review014 — e passa a ter leitura distinta de desligada e de
 * indisponível (Goal018/WU-10).
 */
export function aiStatusView(
  phase: StatusFetchPhase,
  state?: AiStateValue,
): StatusView {
  if (phase === "loading") return "loading";
  if (phase === "error") return "unknown";
  if (state === "ACTIVE") return "active";
  if (state === "PENDING") return "pending";
  if (state === "UNKNOWN") return "unknown";
  return "off";
}

export type AiCardTone = "active" | "danger" | "neutral" | "warning";

export type AiCardView = {
  action: { href: string; label: string } | null;
  support: string | null;
  title: string;
  tone: AiCardTone;
};

/**
 * O que o cartão da IA na sidebar mostra (Goal085, quadro H3). A desconexão
 * confirmada do WhatsApp vem antes de qualquer estado da IA — "IA ativa" com o
 * número fora do ar seria mentira — e é a mesma prioridade da faixa da Home e
 * do banner da casca. WhatsApp `unknown` ou `loading` não muda o cartão: só a
 * desconexão confirmada muda.
 */
export function aiCardView(ai: StatusView, whatsapp: StatusView): AiCardView {
  if (whatsapp === "off") {
    return {
      action: { href: "/configuracoes/whatsapp", label: "Reconectar" },
      support: "a IA não está atendendo",
      title: "WhatsApp desconectado",
      tone: "danger",
    };
  }
  switch (ai) {
    case "loading":
      return {
        action: null,
        support: null,
        title: "Verificando IA",
        tone: "neutral",
      };
    case "unknown":
      return {
        action: null,
        support: null,
        title: "IA não confirmado",
        tone: "neutral",
      };
    case "active":
      return {
        action: { href: "/configuracoes/ia", label: "Pausar" },
        support: "atendendo pelo WhatsApp",
        title: "IA ativa",
        tone: "active",
      };
    case "pending":
      return {
        action: null,
        support: null,
        title: "IA em ativação",
        tone: "warning",
      };
    default:
      return {
        action: null,
        support: null,
        title: "IA desligada",
        tone: "danger",
      };
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Dias que faltam até a purga, a partir do vencimento que `GET /v1/status`
 * devolve — nunca contados no cliente a partir do instante do pedido.
 *
 * Mora aqui, junto das outras derivações de `/v1/status`, porque tem dois
 * consumidores: o aviso persistente do shell e a seção Conta. Duas cópias
 * poderiam arredondar diferente e mostrar prazos diferentes para a mesma
 * exclusão, na mesma tela.
 */
export function accountDeletionDaysRemaining(
  dueAt: string,
  now: Date = new Date(),
): number {
  const diff = new Date(dueAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / MS_PER_DAY));
}

const REVALIDATE_MS = 45_000;

export type UseSystemStatusResult = {
  accountDeletion: SystemStatus["accountDeletion"] | null;
  ai: SystemStatus["ai"] | null;
  aiView: StatusView;
  phase: StatusFetchPhase;
  /** Refaz `GET /v1/status` fora do intervalo de 45s, sem inventar estado. */
  refresh: () => void;
  whatsapp: SystemStatus["whatsapp"] | null;
  whatsappView: StatusView;
  notificationsPhase: StatusFetchPhase;
  notificationsSummary: NotificationSummary | null;
};

/**
 * Carrega `GET /v1/status` e o resumo da central de notificações
 * (`GET /v1/notifications/summary`, Goal022/WU-06) sob o mesmo tick — uma
 * montagem, um intervalo, um listener de foco. O resumo tem fase própria:
 * uma falha nele nunca deve aparentar que WhatsApp ou IA caíram, e
 * vice-versa.
 */
function useSystemStatusPolling(): UseSystemStatusResult {
  const [phase, setPhase] = useState<StatusFetchPhase>("loading");
  const [data, setData] = useState<SystemStatus | null>(null);
  const [notificationsPhase, setNotificationsPhase] =
    useState<StatusFetchPhase>("loading");
  const [notificationsSummary, setNotificationsSummary] =
    useState<NotificationSummary | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    function load() {
      const services = getProductServices();

      services.status
        .get(controller.signal)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setPhase("loaded");
        })
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setPhase("error");
        });

      services.notifications
        .summary(controller.signal)
        .then((result) => {
          if (cancelled) return;
          setNotificationsSummary(result);
          setNotificationsPhase("loaded");
        })
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setNotificationsPhase("error");
        });
    }

    load();
    const interval = window.setInterval(load, REVALIDATE_MS);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
    };
    // `reloadToken` existe só para permitir que `refresh()` force uma nova
    // passada (ex.: depois de pedir/cancelar a exclusão de conta) sem esperar
    // os 45s do intervalo — o efeito reabre o listener/intervalo, mas o
    // estado exposto continua vindo sempre de `GET /v1/status`.
  }, [reloadToken]);

  return {
    accountDeletion: data?.accountDeletion ?? null,
    ai: data?.ai ?? null,
    aiView: aiStatusView(phase, data?.ai.state),
    phase,
    refresh,
    whatsapp: data?.whatsapp ?? null,
    whatsappView: whatsappStatusView(phase, data?.whatsapp.status),
    notificationsPhase,
    notificationsSummary,
  };
}

const SystemStatusContext = createContext<UseSystemStatusResult | null>(null);

/**
 * Único ponto de `useSystemStatusPolling` da árvore: `AppShell` monta este
 * provider uma vez (Goal018/WU-10) e tanto o próprio shell quanto a tela
 * filha (ex.: `DashboardScreen`) leem o mesmo resultado via `useSystemStatus`,
 * em vez de cada um abrir seu próprio `setInterval`/listener de `focus`.
 */
export function SystemStatusProvider({ children }: { children: ReactNode }) {
  const value = useSystemStatusPolling();
  return (
    <SystemStatusContext.Provider value={value}>
      {children}
    </SystemStatusContext.Provider>
  );
}

/** Lê o status compartilhado pelo `SystemStatusProvider` mais próximo. */
/** O mesmo estado, ou `null` fora do provider (telas montadas sozinhas). */
export function useOptionalSystemStatus(): UseSystemStatusResult | null {
  return useContext(SystemStatusContext);
}

export function useSystemStatus(): UseSystemStatusResult {
  const value = useContext(SystemStatusContext);
  if (!value) {
    throw new Error(
      "useSystemStatus must be used inside SystemStatusProvider.",
    );
  }
  return value;
}
