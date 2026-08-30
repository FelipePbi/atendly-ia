"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { AiTone, CalendarSource, OnboardingState } from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

export type OnboardingDraft = {
  businessCategory: string;
  businessName: string;
  calendarSource: CalendarSource | null;
  days: number[];
  endTime: string;
  serviceDuration: number;
  serviceId?: string;
  serviceName: string;
  servicePrice: string;
  servicePriceType: "FIXED" | "ON_REQUEST";
  startTime: string;
  timezone: string;
  tone: AiTone | null;
};

type OnboardingRuntimeValue = {
  draft: OnboardingDraft;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<OnboardingState>;
  setDraft: React.Dispatch<React.SetStateAction<OnboardingDraft>>;
  state: OnboardingState | null;
};

const initialDraft: OnboardingDraft = {
  businessCategory: "",
  businessName: "",
  calendarSource: null,
  days: [1, 2, 3, 4, 5],
  endTime: "18:00",
  serviceDuration: 60,
  serviceName: "",
  servicePrice: "",
  servicePriceType: "FIXED",
  startTime: "09:00",
  timezone: "America/Sao_Paulo",
  tone: null,
};

const OnboardingRuntimeContext = createContext<OnboardingRuntimeValue | null>(
  null,
);

export function OnboardingRuntimeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const nextState = await getProductServices().onboarding.get();
    setState(nextState);
    setDraft((current) => draftFromState(nextState, current));
    return nextState;
  }

  useEffect(() => {
    let active = true;
    getProductServices()
      .onboarding.get()
      .then((nextState) => {
        if (!active) return;
        setState(nextState);
        setDraft((current) => draftFromState(nextState, current));
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar sua configuração.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(
    () => ({ draft, error, loading, refresh, setDraft, state }),
    [draft, error, loading, state],
  );
  return (
    <OnboardingRuntimeContext.Provider value={value}>
      {children}
    </OnboardingRuntimeContext.Provider>
  );
}

export function useOnboardingRuntime() {
  const value = useContext(OnboardingRuntimeContext);
  if (!value) throw new Error("Onboarding runtime is not available.");
  return value;
}

export function OnboardingResume() {
  const router = useRouter();
  const { error, loading, state } = useOnboardingRuntime();
  useEffect(() => {
    if (!state) return;
    router.replace(`/onboarding/${nextRequiredStep(state)}`);
  }, [router, state]);
  if (error) return <RuntimeMessage message={error} />;
  return (
    <RuntimeMessage
      message={loading ? "Carregando configuração..." : "Continuando..."}
    />
  );
}

export function nextRequiredStep(state: OnboardingState): string {
  if (!state.business?.name || !state.business.category)
    return "dados-do-negocio";
  if (!state.calendar.source) return "fonte-da-agenda";
  if (state.calendar.source === "EXTERNAL") return "minha-agenda-conectar";
  if (!state.service) return "servico-nome";
  if (!state.availability?.rules.some((rule) => rule.active)) {
    return "dias-de-atendimento";
  }
  if (!state.ai.tone) return "tom-da-ia";
  if (state.whatsapp?.status !== "CONNECTED") return "whatsapp";
  return "validacao";
}

function draftFromState(
  state: OnboardingState,
  current: OnboardingDraft,
): OnboardingDraft {
  const activeRules =
    state.availability?.rules.filter((rule) => rule.active) ?? [];
  return {
    ...current,
    businessCategory: state.business?.category ?? current.businessCategory,
    businessName: state.business?.name ?? current.businessName,
    calendarSource: state.calendar.source,
    days: activeRules.length
      ? [...new Set(activeRules.map((rule) => rule.dayOfWeek))]
      : current.days,
    endTime: activeRules[0]?.endTime ?? current.endTime,
    serviceDuration: state.service?.durationMinutes ?? current.serviceDuration,
    serviceId: state.service?.id ?? current.serviceId,
    serviceName: state.service?.name ?? current.serviceName,
    servicePrice:
      state.service?.price === null || state.service?.price === undefined
        ? current.servicePrice
        : String(state.service.price),
    servicePriceType: state.service?.priceType ?? current.servicePriceType,
    startTime: activeRules[0]?.startTime ?? current.startTime,
    timezone:
      state.business?.timezone ?? state.calendar.timezone ?? current.timezone,
    tone: state.ai.tone,
  };
}

function RuntimeMessage({ message }: { message: string }) {
  return (
    <main className="onboarding-shell">
      <section className="onboarding-main">
        <div className="analysis-panel" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>{message}</p>
        </div>
      </section>
    </main>
  );
}
