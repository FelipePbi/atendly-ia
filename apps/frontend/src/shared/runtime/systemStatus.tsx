"use client";

import {
  createContext,
  type ReactNode,
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

const REVALIDATE_MS = 45_000;

export type UseSystemStatusResult = {
  ai: SystemStatus["ai"] | null;
  aiView: StatusView;
  phase: StatusFetchPhase;
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
  }, []);

  return {
    ai: data?.ai ?? null,
    aiView: aiStatusView(phase, data?.ai.state),
    phase,
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
export function useSystemStatus(): UseSystemStatusResult {
  const value = useContext(SystemStatusContext);
  if (!value) {
    throw new Error("useSystemStatus must be used inside SystemStatusProvider.");
  }
  return value;
}
