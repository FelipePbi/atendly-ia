// @vitest-environment jsdom
/**
 * Goal019 (critério 27): prova de acessibilidade das telas novas deste Goal.
 *
 * As telas novas são as cinco do teste real (explicação, progresso,
 * interferência, falha, sucesso) mais as duas que o Goal acrescentou ao
 * onboarding: a demonstração da IA (bloco "Sua IA") e os contatos ignorados
 * (bloco "WhatsApp"). Nenhuma delas passava pelo axe: elas apareciam em
 * `goal018-onboarding-reachability` apenas como alcance por rota, e alcance
 * não é acessibilidade.
 *
 * Esta suíte segue o padrão de `goal017-a11y` e `goal018-a11y`: axe sobre a
 * árvore renderizada, com os estados que mudam a árvore — progresso parcial,
 * pausa, falha com passo nomeado, sucesso com resíduo — cobertos um a um,
 * porque cada um deles renderiza marcação diferente.
 *
 * O que esta suíte não prova: layout real, largura de viewport, contraste
 * computado. Isso é `npm run validate:ui`, não jsdom.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, test, vi } from "vitest";

import type { ActivationTestRun, OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const getActivationTest = vi.fn();
const listConversations = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: vi.fn(),
      start: vi.fn(),
    },
    auth: { logout: vi.fn() },
    conversations: {
      ignoreByPhone: vi.fn(),
      list: listConversations,
      setIgnored: vi.fn(),
    },
    onboarding: { complete: vi.fn(), get: getOnboarding, update: vi.fn() },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

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
  const { reachedCount = 0, ...rest } = overrides;
  const state = rest.state ?? "RUNNING";
  return {
    id: "run-1",
    state,
    terminal: state !== "RUNNING" && state !== "PAUSED_BY_HUMAN",
    startedAt: "2026-09-14T12:00:00.000Z",
    finishedAt: null,
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
    cleanupState: "PENDING",
    cleanupAt: null,
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

function onboardingFixture(): OnboardingState {
  return {
    ai: { tone: "BALANCED" },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      modalities: ["ONLINE"],
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    completed: true,
    completedAt: "2026-09-14T11:00:00.000Z",
    service: null,
    whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
  };
}

async function renderAndAwait(scenario: OnboardingScenario, settled: string) {
  const { container } = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
  await screen.findByText(settled);
  return container;
}

beforeEach(() => {
  vi.clearAllMocks();
  getOnboarding.mockResolvedValue(onboardingFixture());
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511999990000",
    status: "CONNECTED",
  });
  getActivationTest.mockResolvedValue(null);
  listConversations.mockResolvedValue([]);
});

describe("telas do teste real passam no axe", () => {
  test("explicação antes do teste", async () => {
    await expectNoA11yViolations(
      await renderAndAwait("teste-real", "Vamos fazer um teste real"),
    );
  });

  test("progresso com marcos parcialmente alcançados", async () => {
    getActivationTest.mockResolvedValue(runFixture({ reachedCount: 3 }));
    await expectNoA11yViolations(
      await renderAndAwait(
        "teste-real-progresso",
        "Sua IA está atendendo o cliente de teste",
      ),
    );
  });

  test("interferência humana", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({ state: "PAUSED_BY_HUMAN" }),
    );
    await expectNoA11yViolations(
      await renderAndAwait(
        "teste-real-interferencia",
        "O teste foi pausado porque você respondeu",
      ),
    );
  });

  test("falha com o passo nomeado", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        state: "FAILED",
        attempts: 3,
        failedStep: "AI_CHECKS_AVAILABILITY",
        failedStepLabel: "consultar a agenda",
        failureCode: "ACTIVATION_TEST_STEP_FAILED",
        cleanupState: "CLEAN",
        cleanupAt: "2026-09-14T12:09:00.000Z",
      }),
    );
    await expectNoA11yViolations(
      await renderAndAwait("teste-real-falha", "O teste não chegou ao fim"),
    );
  });

  test("sucesso com resíduo de limpeza", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        state: "SUCCEEDED",
        reachedCount: 6,
        cleanupState: "RESIDUAL",
        cleanupAt: "2026-09-14T12:09:00.000Z",
        cleanupResidue: [
          {
            target: "CUSTOMER",
            id: "customer-1",
            reason: "OPERATION_UNAVAILABLE",
            label: "pessoa de teste",
            explanation: "precisa ser removida a mão",
          },
        ],
      }),
    );
    await expectNoA11yViolations(
      await renderAndAwait("teste-real-sucesso", "Tudo pronto!"),
    );
  });
});

describe("telas novas do onboarding deste Goal passam no axe", () => {
  test("demonstração da IA", async () => {
    await expectNoA11yViolations(
      await renderAndAwait(
        "demonstracao-da-ia",
        "Veja sua IA atendendo",
      ),
    );
  });

  test("contatos ignorados, sem conversas para escolher", async () => {
    await expectNoA11yViolations(
      await renderAndAwait(
        "contatos-ignorados",
        "Quer impedir que a IA responda algumas pessoas?",
      ),
    );
  });

  test("contatos ignorados, com conversas listadas", async () => {
    listConversations.mockResolvedValue([
      {
        id: "conversation-1",
        channelId: "channel-1",
        externalContactId: "5511988887777",
        customerName: "Marina",
        status: "ACTIVE",
        handling: "AI",
        ignored: false,
        lastMessageAt: "2026-09-14T11:30:00.000Z",
        unreadCount: 0,
      },
    ]);
    await expectNoA11yViolations(
      await renderAndAwait(
        "contatos-ignorados",
        "Quer impedir que a IA responda algumas pessoas?",
      ),
    );
  });
});
