// @vitest-environment jsdom
/**
 * Goal063 (WU-02) — a IA só liga depois do teste real.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - `Continuar` e `Pular por agora` em contatos-ignorados não concluem o
 *   onboarding: quem conclui é o teste real que termina bem;
 * - `Fazer isso depois` (WhatsApp) leva a `whatsapp-concluido` sem concluir
 *   ainda; só o CTA dessa tela conclui e leva a `/inicio`;
 * - `Fazer isso depois` do teste real e o CTA de sucesso concluem o
 *   onboarding e levam a `/inicio`;
 * - a tela de sucesso só afirma "Sua IA está ativa" depois de
 *   `GET /v1/status` confirmar `ACTIVE` — nos demais estados ela diz o
 *   estado real, sem inventar;
 * - `OnboardingResume` com WhatsApp conectado leva à execução corrente
 *   quando ela existe, ou a `contatos-ignorados` sem execução; falha de
 *   leitura não vira sucesso nem falha.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ActivationTestRun, OnboardingState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const getActivationTest = vi.fn();
const startActivationTest = vi.fn();
const restartActivationTest = vi.fn();
const refreshSession = vi.fn();
const statusGet = vi.fn();
const listConversations = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: restartActivationTest,
      start: startActivationTest,
    },
    auth: { logout: vi.fn() },
    conversations: {
      ignoreByPhone: vi.fn(),
      list: listConversations,
      setIgnored: vi.fn(),
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    status: { get: statusGet },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

import OnboardingPage from "@/app/onboarding/[step]/page";
import {
  OnboardingResume,
  OnboardingRuntimeProvider,
} from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

const MILESTONES = [
  "MESSAGE_SENT",
  "SERVICE_IDENTIFIED",
  "PRICE_INFORMED",
  "AVAILABILITY_CHECKED",
  "SLOT_SELECTED",
  "APPOINTMENT_CONFIRMED",
] as const;

function runFixture(
  overrides: Partial<ActivationTestRun> & { reachedCount?: number } = {},
): ActivationTestRun {
  const { reachedCount = 6, ...rest } = overrides;
  const state = rest.state ?? "SUCCEEDED";
  return {
    id: "run-1",
    state,
    terminal: state !== "RUNNING" && state !== "PAUSED_BY_HUMAN",
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: "2026-09-14T12:05:00.000Z",
    pausedAt: null,
    currentStep: null,
    completedStep: null,
    attempts: 1,
    maxAttempts: 3,
    failedStep: null,
    failedStepLabel: null,
    failureCode: null,
    appointmentId: null,
    channelId: "channel-1",
    supersededByChannelChange: false,
    cleanupState: "CLEAN",
    cleanupAt: "2026-09-14T12:06:00.000Z",
    cleanupResidue: [],
    milestones: MILESTONES.map((milestone, index) => ({
      milestone,
      reached: index < reachedCount,
      reachedAt: index < reachedCount ? "2026-09-14T12:01:00.000Z" : null,
      sourceKind: index < reachedCount ? ("MESSAGE" as const) : null,
      sourceId: index < reachedCount ? `fact-${milestone}` : null,
    })),
    ...rest,
  };
}

function statusFixture(
  aiState: "ACTIVE" | "OFF" | "PENDING" | "UNKNOWN",
) {
  return {
    accountDeletion: { dueAt: null, status: "NONE" as const },
    ai: {
      desiredEnabled: true,
      effectiveEnabled: aiState === "ACTIVE",
      reconciled: "CONVERGED" as const,
      state: aiState,
    },
    degraded: false,
    whatsapp: {
      checkedAt: "2026-09-14T12:06:00.000Z",
      phoneNumber: "+5511999990000",
      status: "CONNECTED" as const,
    },
  };
}

function emptyState(): OnboardingState {
  return {
    ai: { tone: null },
    availability: null,
    business: null,
    calendar: { integration: null, source: null, timezone: null },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

const readyState: OnboardingState = {
  ai: { tone: "PROFESSIONAL" },
  availability: {
    customerChangeMinNoticeMinutes: 0,
    granularityMinutes: 30,
    maxLeadDays: 90,
    minLeadMinutes: 0,
    rules: [
      { active: true, dayOfWeek: 1, endTime: "18:00", id: "rule-1", startTime: "09:00" },
    ],
    timezone: "America/Sao_Paulo",
  },
  business: {
    address: null,
    category: "Beleza",
    modalities: ["ONLINE"],
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
  calendar: { integration: null, source: "AVENLY", timezone: "America/Sao_Paulo" },
  completed: false,
  completedAt: null,
  service: {
    active: true,
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    durationMinutes: 60,
    id: "svc-1",
    name: "Corte",
    needsReview: false,
    price: 100,
    priceType: "FIXED",
  },
  whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
};

function renderScreen(scenario: OnboardingScenario, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  completeOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
  listConversations.mockResolvedValue([]);
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511999990000",
    status: "CONNECTED",
  });
  getActivationTest.mockResolvedValue(null);
});

describe("contatos-ignorados não conclui: quem conclui é o teste real", () => {
  test("Continuar avança sem chamar onboarding.complete()", async () => {
    const user = userEvent.setup();
    renderScreen("contatos-ignorados", readyState);

    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
  });

  test("Pular por agora avança sem chamar onboarding.complete()", async () => {
    const user = userEvent.setup();
    renderScreen("contatos-ignorados", readyState);

    await user.click(
      await screen.findByRole("button", { name: "Pular por agora" }),
    );

    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real");
  });
});

describe("Fazer isso depois e o CTA de sucesso concluem; whatsapp-concluido é intermediário", () => {
  test("whatsapp: Fazer isso depois leva a whatsapp-concluido sem concluir", async () => {
    const user = userEvent.setup();
    renderScreen("whatsapp", readyState);

    await user.click(
      await screen.findByRole("button", { name: "Fazer isso depois" }),
    );

    expect(completeOnboarding).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/whatsapp-concluido");
  });

  test("whatsapp-concluido: o CTA Ir para o início é quem conclui e vai a /inicio", async () => {
    const user = userEvent.setup();
    renderScreen("whatsapp-concluido", readyState);

    await user.click(
      await screen.findByRole("button", { name: "Ir para o início" }),
    );

    expect(completeOnboarding).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });

  test("teste-real: Fazer isso depois conclui e vai a /inicio", async () => {
    const user = userEvent.setup();
    renderScreen("teste-real", readyState);

    await user.click(
      await screen.findByRole("button", { name: "Fazer isso depois" }),
    );

    expect(completeOnboarding).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });

  test("teste-real-sucesso: o CTA Ir para o início conclui e vai a /inicio", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE"));
    getActivationTest.mockResolvedValue(runFixture());
    const user = userEvent.setup();
    renderScreen("teste-real-sucesso", readyState);

    await user.click(
      await screen.findByRole("button", { name: "Ir para o início" }),
    );

    expect(completeOnboarding).toHaveBeenCalled();
    expect(refreshSession).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/inicio");
  });
});

describe("sucesso: \"Sua IA está ativa\" só depois de GET /v1/status confirmar", () => {
  test("status ACTIVE: mostra a confirmação real de ativação", async () => {
    statusGet.mockResolvedValue(statusFixture("ACTIVE"));
    getActivationTest.mockResolvedValue(runFixture());
    renderScreen("teste-real-sucesso", readyState);

    expect(
      await screen.findByText(
        "Sua IA está ativa e pronta para atender seus clientes.",
      ),
    ).toBeVisible();
  });

  test("status PENDING: não afirma ativa, diz o estado real", async () => {
    statusGet.mockResolvedValue(statusFixture("PENDING"));
    getActivationTest.mockResolvedValue(runFixture());
    renderScreen("teste-real-sucesso", readyState);

    expect(
      await screen.findByText(/Sua IA está sendo ativada/),
    ).toBeVisible();
    expect(
      screen.queryByText("Sua IA está ativa e pronta para atender seus clientes."),
    ).not.toBeInTheDocument();
  });

  test("status OFF: não afirma ativa, diz o estado real", async () => {
    statusGet.mockResolvedValue(statusFixture("OFF"));
    getActivationTest.mockResolvedValue(runFixture());
    renderScreen("teste-real-sucesso", readyState);

    expect(await screen.findByText("Sua IA ainda não foi ativada.")).toBeVisible();
  });

  test("falha ao ler o status: não afirma ativa nem inventa outro estado", async () => {
    statusGet.mockRejectedValue(new Error("network"));
    getActivationTest.mockResolvedValue(runFixture());
    renderScreen("teste-real-sucesso", readyState);

    expect(
      await screen.findByText(
        "Não foi possível confirmar se sua IA já está ativa.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText("Sua IA está ativa e pronta para atender seus clientes."),
    ).not.toBeInTheDocument();
  });
});

describe("OnboardingResume retoma na execução corrente", () => {
  function renderResume(state: OnboardingState) {
    getOnboarding.mockResolvedValue(state);
    return render(
      <OnboardingRuntimeProvider>
        <OnboardingResume />
      </OnboardingRuntimeProvider>,
    );
  }

  test("WhatsApp conectado e teste em andamento leva à tela de progresso", async () => {
    getActivationTest.mockResolvedValue(runFixture({ state: "RUNNING" }));
    renderResume(readyState);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/teste-real-progresso"),
    );
  });

  test("WhatsApp conectado sem execução nenhuma leva a contatos-ignorados", async () => {
    getActivationTest.mockResolvedValue(null);
    renderResume(readyState);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/contatos-ignorados"),
    );
  });

  test("falha ao ler a execução não redireciona para sucesso nem falha", async () => {
    getActivationTest.mockRejectedValue(new Error("network"));
    renderResume(readyState);

    expect(
      await screen.findByText("Não foi possível retomar sua configuração."),
    ).toBeVisible();
    expect(replace).not.toHaveBeenCalledWith(
      "/onboarding/teste-real-sucesso",
    );
    expect(replace).not.toHaveBeenCalledWith("/onboarding/teste-real-falha");
    expect(replace).not.toHaveBeenCalledWith(
      "/onboarding/contatos-ignorados",
    );
  });

  test("sem WhatsApp conectado, a retomada não consulta o teste", async () => {
    renderResume(emptyState());

    // Goal065/WU-02: estado totalmente vazio retoma em "boas-vindas", não
    // mais em "dados-do-negocio" (dividido em quatro etapas).
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/onboarding/boas-vindas"),
    );
    expect(getActivationTest).not.toHaveBeenCalled();
  });
});

describe("o módulo do teste real é compartilhável, não copiado por tela", () => {
  test("scenario teste-real-progresso e teste-real-sucesso usam a mesma origem de marcos e limpeza", async () => {
    const shared = await import(
      "@/features/activation-test/ActivationTestPanels"
    );
    expect(Object.keys(shared.MILESTONE_LABELS)).toEqual([
      "MESSAGE_SENT",
      "SERVICE_IDENTIFIED",
      "PRICE_INFORMED",
      "AVAILABILITY_CHECKED",
      "SLOT_SELECTED",
      "APPOINTMENT_CONFIRMED",
    ]);
    expect(typeof shared.connectedPhone).toBe("function");
    expect(typeof shared.useAiActiveStatus).toBe("function");
  });
});

describe("navegação real da rota também alcança os cenários deste Goal", () => {
  test("teste-real-sucesso monta pela rota real sem 404", async () => {
    getOnboarding.mockResolvedValue(readyState);
    getActivationTest.mockResolvedValue(runFixture());
    statusGet.mockResolvedValue(statusFixture("ACTIVE"));
    render(
      <OnboardingRuntimeProvider>
        {await OnboardingPage({
          params: Promise.resolve({ step: "teste-real-sucesso" }),
        })}
      </OnboardingRuntimeProvider>,
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Tudo pronto!" }),
    ).toBeVisible();
  });
});
