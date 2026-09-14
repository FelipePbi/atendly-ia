"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import type { AiStateValue, SystemStatus, WhatsAppStatusValue } from "@/data";

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
};

/** Carrega `GET /v1/status` uma vez por montagem, com revalidação por intervalo e foco. */
function useSystemStatusPolling(): UseSystemStatusResult {
  const [phase, setPhase] = useState<StatusFetchPhase>("loading");
  const [data, setData] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    function load() {
      getProductServices()
        .status.get(controller.signal)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setPhase("loaded");
        })
        .catch(() => {
          if (cancelled || controller.signal.aborted) return;
          setPhase("error");
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
