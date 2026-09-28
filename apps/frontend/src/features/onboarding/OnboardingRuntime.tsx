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

import type {
  AiTone,
  BusinessModality,
  CalendarSource,
  ImportState,
  OnboardingState,
} from "@/data";
import { getProductServices } from "@/shared/runtime/ProductRuntime";

import { activationTestScenarioFor } from "./blocks/activation-test";

export type OnboardingDraft = {
  businessAddress: string;
  businessCategory: string;
  businessModalities: BusinessModality[];
  businessName: string;
  calendarSource: CalendarSource | null;
  days: number[];
  // Intervalo por dia gravado com "Personalizar dias diferentes"; um campo
  // ausente naquele dia acompanha o intervalo-base (`startTime`/`endTime`)
  // enquanto não for personalizado, mesmo depois de o dia ganhar uma
  // personalização no outro campo (Goal066, observação 5 do review065).
  dayHours: Record<number, Partial<{ startTime: string; endTime: string }>>;
  endTime: string;
  // Lidos do estado real do negócio (não editáveis pelo formulário): guardam
  // a demonstração da IA (WU-07) sem serviço inoperante nem horário vazio,
  // mesma definição de "operacional" do checklist pós-onboarding.
  hoursValid: boolean;
  serviceDuration: number;
  serviceId?: string;
  serviceName: string;
  serviceOperational: boolean;
  servicePrice: string;
  servicePriceType: "FIXED" | "STARTING_AT" | "ON_REQUEST" | "NOT_INFORMED";
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
  businessAddress: "",
  businessCategory: "",
  businessModalities: [],
  businessName: "",
  calendarSource: null,
  days: [1, 2, 3, 4, 5],
  dayHours: {},
  endTime: "18:00",
  hoursValid: false,
  serviceDuration: 60,
  serviceName: "",
  serviceOperational: false,
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
  const [resumeError, setResumeError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const fallback = nextRequiredStep(state);
    // Sem serviço ativo, uma importação viva é onde a pessoa parou
    // (Goal066): só aqui a retomada lê o estado da importação. Se a leitura
    // falhar, segue a regra sem importação, sem bloquear o onboarding — a
    // importação continua alcançável por Mais › Importação.
    if (fallback === "servico-nome") {
      let active = true;
      getProductServices()
        .migration.getImportState()
        .then((importState) => {
          if (active) {
            router.replace(
              `/onboarding/${nextRequiredStep(state, importState)}`,
            );
          }
        })
        .catch(() => {
          if (active) router.replace(`/onboarding/${fallback}`);
        });
      return () => {
        active = false;
      };
    }
    // Só há execução para conferir depois que WhatsApp conecta e as demais
    // etapas terminam: é o único caso em que `nextRequiredStep` aponta para
    // `contatos-ignorados`. Antes disso, a retomada não lê o teste — não há
    // execução possível sem WhatsApp.
    if (fallback !== "contatos-ignorados") {
      router.replace(`/onboarding/${fallback}`);
      return;
    }
    let active = true;
    getProductServices()
      .activationTest.get()
      .then((run) => {
        if (!active) return;
        router.replace(
          `/onboarding/${run ? activationTestScenarioFor(run) : fallback}`,
        );
      })
      .catch(() => {
        // Falha de leitura não vira sucesso nem falha: a tela fica aqui,
        // sem redirecionar para um estado que ninguém confirmou.
        if (active) {
          setResumeError("Não foi possível retomar sua configuração.");
        }
      });
    return () => {
      active = false;
    };
  }, [router, state]);

  if (error) return <RuntimeMessage message={error} />;
  if (resumeError) return <RuntimeMessage message={resumeError} />;
  return (
    <RuntimeMessage
      message={loading ? "Carregando configuração..." : "Continuando..."}
    />
  );
}

/**
 * A próxima etapa pendente. `importState` só pesa entre `calendar.source` e
 * o primeiro serviço (Goal066): sem serviço ativo e com uma sessão de
 * importação viva, a pessoa volta para a importação; com a importação
 * concluída, vale a mesma ordem da saída dela (`stepAfterImport`), que é a
 * desta função. Sem estado de importação lido, a regra é a de antes.
 */
export function nextRequiredStep(
  state: OnboardingState,
  importState: ImportState | null = null,
): string {
  // Business é gravado atômico (nome+categoria+timezone sempre juntos): sem
  // nome, nada do bloco foi gravado ainda, e a conta volta para Boas-vindas
  // (nunca retomada depois de qualquer gravação — Goal065/WU-02).
  if (!state.business?.name) return "boas-vindas";
  const modalities = state.business.modalities ?? [];
  if (modalities.length === 0) return "modalidade";
  if (modalities.includes("ON_SITE") && !state.business.address) {
    return "endereco";
  }
  if (!state.calendar.source) return "sistema-atual";
  if (!state.service) {
    return importState?.session && !importState.history
      ? "importacao"
      : "servico-nome";
  }
  if (!state.availability?.rules.some((rule) => rule.active)) {
    return "dias-de-atendimento";
  }
  if (!state.ai.tone) return "demonstracao-da-ia";
  if (state.whatsapp?.status !== "CONNECTED") return "whatsapp";
  return "contatos-ignorados";
}

/**
 * Saída da etapa `importacao` com a importação concluída (vault §5B): a
 * primeira pendência que a importação não resolveu, com o aviso que a
 * explica. O estado é o relido do BFF, que já lista os serviços e os
 * horários importados.
 */
export function stepAfterImport(state: OnboardingState): {
  notice: string;
  step: "demonstracao-da-ia" | "dias-de-atendimento" | "servico-nome";
} {
  if (!state.service) {
    return {
      notice:
        "Nenhum serviço importado está ativo. Cadastre pelo menos um serviço para continuar.",
      step: "servico-nome",
    };
  }
  if (!state.availability?.rules.some((rule) => rule.active)) {
    return {
      notice:
        "A importação não trouxe seus horários de atendimento. Informe os dias e horários em que você atende.",
      step: "dias-de-atendimento",
    };
  }
  return {
    notice:
      "Seus serviços e horários foram importados. Agora é só ver sua IA em ação.",
    step: "demonstracao-da-ia",
  };
}

function draftFromState(
  state: OnboardingState,
  current: OnboardingDraft,
): OnboardingDraft {
  const activeRules =
    state.availability?.rules.filter((rule) => rule.active) ?? [];
  // Reconstrói o intervalo por dia do que está gravado, não só a primeira
  // regra. O intervalo-base é o mais frequente (empate: o primeiro da semana,
  // a partir da segunda), e `dayHours` guarda só os dias que diferem dele:
  // um dia sem personalização real acompanha o intervalo-base quando a
  // pessoa o muda na retomada (Goal065, rodada 2).
  const baseHours = mostFrequentInterval(activeRules);
  const dayHours = Object.fromEntries(
    activeRules
      .filter(
        (rule) =>
          baseHours !== null &&
          (rule.startTime !== baseHours.startTime ||
            rule.endTime !== baseHours.endTime),
      )
      .map((rule) => [
        rule.dayOfWeek,
        { endTime: rule.endTime, startTime: rule.startTime },
      ]),
  );
  return {
    ...current,
    businessAddress: state.business?.address ?? current.businessAddress,
    businessCategory: state.business?.category ?? current.businessCategory,
    businessModalities:
      state.business?.modalities ?? current.businessModalities,
    businessName: state.business?.name ?? current.businessName,
    calendarSource: state.calendar.source,
    days: activeRules.length
      ? [...new Set(activeRules.map((rule) => rule.dayOfWeek))]
      : current.days,
    dayHours: activeRules.length ? dayHours : current.dayHours,
    endTime: baseHours?.endTime ?? current.endTime,
    // Mesma definição de "operacional" do checklist pós-onboarding e do
    // Scheduling (`isOperationalService`): ativo e com duração definida.
    hoursValid: activeRules.length > 0,
    serviceDuration: state.service?.durationMinutes ?? current.serviceDuration,
    serviceId: state.service?.id ?? current.serviceId,
    serviceName: state.service?.name ?? current.serviceName,
    serviceOperational: Boolean(
      state.service?.active && state.service.durationMinutes !== null,
    ),
    servicePrice:
      state.service?.price === null || state.service?.price === undefined
        ? current.servicePrice
        : String(state.service.price),
    // Os quatro tipos são gravados e relidos sem conversão (Goal065/WU-03).
    servicePriceType: state.service?.priceType ?? current.servicePriceType,
    startTime: baseHours?.startTime ?? current.startTime,
    timezone:
      state.business?.timezone ?? state.calendar.timezone ?? current.timezone,
    tone: state.ai.tone,
  };
}

// Ordem de exibição da semana (segunda primeiro), usada só para desempatar.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function mostFrequentInterval(
  rules: Array<{ dayOfWeek: number; endTime: string; startTime: string }>,
): { endTime: string; startTime: string } | null {
  const ordered = [...rules].sort(
    (a, b) => WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek),
  );
  let best: { count: number; endTime: string; startTime: string } | null = null;
  for (const rule of ordered) {
    const count = ordered.filter(
      (other) =>
        other.startTime === rule.startTime && other.endTime === rule.endTime,
    ).length;
    if (!best || count > best.count) {
      best = { count, endTime: rule.endTime, startTime: rule.startTime };
    }
  }
  return best && { endTime: best.endTime, startTime: best.startTime };
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
