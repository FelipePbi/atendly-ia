// @vitest-environment jsdom
/**
 * Goal019 §9 — as telas do teste real.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - cada tela lê o estado do servidor e **nada** é afirmado sem leitura: nem
 *   marco concluído, nem envio, nem agendamento, nem limpeza, nem ativação;
 * - os seis marcos do vault são legíveis um a um, e um marco só aparece
 *   concluído quando a leitura o trouxe `reached: true` — tempo decorrido não
 *   marca nada;
 * - interferência humana leva à tela de pausa, com `Reiniciar teste`;
 * - falha nomeia o passo em linguagem do negócio, vinda do servidor;
 * - sucesso diz "Tudo pronto!" e oferece `Ir para o início`;
 * - a leitura de progresso **para** em estado terminal — ela não fica
 *   consultando para sempre;
 * - recusa do servidor (número da plataforma ausente, WhatsApp desconectado)
 *   não vira progresso nem sucesso.
 *
 * Cada teste falha se o comportamento for removido: uma tela que voltasse a
 * afirmar marco sem fonte, ou a inventar progresso por tempo, quebra aqui.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type ActivationTestRun, BffHttpError, type OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";

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

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: restartActivationTest,
      start: startActivationTest,
    },
    auth: { logout: vi.fn() },
    conversations: { ignoreByPhone: vi.fn(), list: vi.fn(), setIgnored: vi.fn() },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    status: { get: statusGet },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({ refreshSession, setUnauthenticated: vi.fn() }),
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

/**
 * Execução como o servidor a devolve.
 *
 * `reachedCount` diz quantos marcos vieram com fato gravado: é o único jeito
 * de um marco ficar concluído, aqui e no produto.
 */
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
    calendar: { integration: null, source: "ATENDLY", timezone: "America/Sao_Paulo" },
    completed: true,
    completedAt: "2026-09-14T11:00:00.000Z",
    service: null,
    whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
  };
}

function renderScreen(scenario: OnboardingScenario) {
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  getOnboarding.mockResolvedValue(onboardingFixture());
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511999990000",
    status: "CONNECTED",
  });
  getActivationTest.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("antes do teste: explicação e CTA do vault", () => {
  test("mostra a copy do vault e o CTA `Iniciar teste`", async () => {
    renderScreen("teste-real");

    expect(
      await screen.findByText(
        /Um número da Atendly vai enviar uma mensagem no seu WhatsApp/,
      ),
    ).toBeInTheDocument();
    // Prévia: o aviso que o orquestrador envia e uma pergunta sem serviço.
    expect(
      screen.getByText(/Esta é uma conversa de teste da Atendly/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Oi! Quanto custa o atendimento?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/e sua IA é ativada/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Leva cerca de/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Iniciar teste" }),
    ).toBeInTheDocument();
    // Antes de começar não há execução nenhuma para ler, e a tela não afirma
    // progresso, sucesso nem ativação.
    expect(screen.queryByText("Mensagem enviada")).not.toBeInTheDocument();
    expect(screen.queryByText(/Tudo pronto/)).not.toBeInTheDocument();
  });

  test("`Iniciar teste` usa o número real da conexão e leva ao progresso", async () => {
    const user = userEvent.setup();
    startActivationTest.mockResolvedValue(runFixture());
    renderScreen("teste-real");

    await user.click(
      await screen.findByRole("button", { name: "Iniciar teste" }),
    );

    await waitFor(() =>
      expect(startActivationTest).toHaveBeenCalledWith("+5511999990000"),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real-progresso");
  });

  test("sem WhatsApp conectado o teste não começa e nada é afirmado", async () => {
    const user = userEvent.setup();
    getWhatsapp.mockResolvedValue({ phoneNumber: null, status: "DISCONNECTED" });
    renderScreen("teste-real");

    await user.click(
      await screen.findByRole("button", { name: "Iniciar teste" }),
    );

    expect(await screen.findByText(/Conecte seu WhatsApp/)).toBeInTheDocument();
    expect(startActivationTest).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("recusa do servidor não vira progresso nem sucesso", async () => {
    const user = userEvent.setup();
    startActivationTest.mockRejectedValue(
      new BffHttpError({
        code: "UPSTREAM_ERROR",
        details: { upstreamCode: "PLATFORM_NUMBER_NOT_CONFIGURED" },
        message: "A instancia oficial da Atendly nao esta configurada.",
        requestId: "request-1",
        status: 502,
      }),
    );
    renderScreen("teste-real");

    await user.click(
      await screen.findByRole("button", { name: "Iniciar teste" }),
    );

    await waitFor(() => expect(startActivationTest).toHaveBeenCalled());
    expect(
      await screen.findByText(/O teste real não está disponível neste ambiente/),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(/Tudo pronto/)).not.toBeInTheDocument();
    expect(screen.queryByText("Mensagem enviada")).not.toBeInTheDocument();
  });
});

describe("progresso: os seis marcos, derivados de fato", () => {
  test("os seis marcos do vault são legíveis um a um", async () => {
    getActivationTest.mockResolvedValue(runFixture({ reachedCount: 0 }));
    renderScreen("teste-real-progresso");

    for (const label of [
      "Mensagem enviada",
      "Serviço identificado",
      "Preço informado",
      "Agenda consultada",
      "Horário selecionado",
      "Agendamento confirmado",
    ]) {
      expect(await screen.findByText(new RegExp(label))).toBeInTheDocument();
    }
  });

  test("marco sem fato gravado aparece aguardando, nunca concluído", async () => {
    getActivationTest.mockResolvedValue(runFixture({ reachedCount: 2 }));
    renderScreen("teste-real-progresso");

    // Os dois primeiros vieram com fato; os quatro seguintes, não.
    expect(
      await screen.findByText("Mensagem enviada", { exact: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Serviço identificado", { exact: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("Preço informado — aguardando")).toBeInTheDocument();
    expect(
      screen.getByText("Agendamento confirmado — aguardando"),
    ).toBeInTheDocument();
  });

  test("tempo decorrido não conclui marco nenhum", async () => {
    // A mesma leitura, repetida: o servidor continua sem fato para os marcos
    // seguintes, e a tela continua sem afirmá-los. Este teste falha se a tela
    // voltar a preencher progresso por conta própria.
    getActivationTest.mockResolvedValue(runFixture({ reachedCount: 1 }));
    renderScreen("teste-real-progresso");

    expect(
      await screen.findByText("Mensagem enviada", { exact: true }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(
      screen.getByText("Serviço identificado — aguardando"),
    ).toBeInTheDocument();
  });

  test("a leitura para em estado terminal: não consulta para sempre", async () => {
    vi.useFakeTimers();
    getActivationTest.mockResolvedValue(
      runFixture({ state: "SUCCEEDED", reachedCount: 6 }),
    );
    renderScreen("teste-real-progresso");

    await vi.advanceTimersByTimeAsync(0);
    const callsAfterFirstRead = getActivationTest.mock.calls.length;
    // Muito depois do intervalo de leitura: nada de novo foi pedido.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getActivationTest.mock.calls.length).toBe(callsAfterFirstRead);
    vi.useRealTimers();
  });

  test("a leitura do teste tem ritmo proprio e nao e mais um poller de status", async () => {
    // Criterio 25: continua existindo **um** poller de `GET /v1/status` por
    // arvore renderizada. A leitura de progresso e outra pergunta, com outro
    // intervalo, e ela nao passa por `status`.
    getActivationTest.mockResolvedValue(runFixture({ reachedCount: 2 }));
    renderScreen("teste-real-progresso");

    await screen.findByText("Mensagem enviada", { exact: true });
    expect(statusGet).not.toHaveBeenCalled();
    expect(getActivationTest).toHaveBeenCalled();
  });

  test("continuar le o estado real e leva a tela do estado", async () => {
    const user = userEvent.setup();
    getActivationTest.mockResolvedValue(
      runFixture({ state: "SUCCEEDED", reachedCount: 6 }),
    );
    renderScreen("teste-real-progresso");

    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/teste-real-sucesso"),
    );
  });

  test("execução ainda em andamento não avança para sucesso", async () => {
    const user = userEvent.setup();
    getActivationTest.mockResolvedValue(runFixture({ reachedCount: 3 }));
    renderScreen("teste-real-progresso");

    await user.click(await screen.findByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText(/ainda está em andamento/),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("interferência humana", () => {
  test("explica que é para observar e oferece `Reiniciar teste`", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({ state: "PAUSED_BY_HUMAN", pausedAt: "2026-09-14T12:02:00.000Z" }),
    );
    renderScreen("teste-real-interferencia");

    expect(
      await screen.findByText(/você só precisa observar/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reiniciar teste" }),
    ).toBeInTheDocument();
  });

  test("reiniciar usa a operação de reinício, não a de início", async () => {
    const user = userEvent.setup();
    getActivationTest.mockResolvedValue(
      runFixture({ state: "PAUSED_BY_HUMAN" }),
    );
    restartActivationTest.mockResolvedValue(runFixture());
    renderScreen("teste-real-interferencia");

    await user.click(
      await screen.findByRole("button", { name: "Reiniciar teste" }),
    );

    await waitFor(() =>
      expect(restartActivationTest).toHaveBeenCalledWith("+5511999990000"),
    );
    expect(startActivationTest).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real-progresso");
  });
});

describe("falha", () => {
  test("nomeia o passo que falhou em linguagem do negócio e não afirma ativação", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        state: "FAILED",
        attempts: 3,
        failedStep: "AI_CHECKS_AVAILABILITY",
        failedStepLabel: "consultar a agenda",
        failureCode: "ACTIVATION_TEST_STEP_FAILED",
        reachedCount: 3,
      }),
    );
    renderScreen("teste-real-falha");

    expect(
      await screen.findByText(/O teste parou em: consultar a agenda\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sua IA continua desligada/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tudo pronto/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
  });

  test("sem passo nomeado pelo servidor, a tela não inventa etapa", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({ state: "FAILED", failedStepLabel: null }),
    );
    renderScreen("teste-real-falha");

    expect(
      await screen.findByText("O teste parou antes de terminar."),
    ).toBeInTheDocument();
  });
});

describe("sucesso", () => {
  test("diz `Tudo pronto!` e oferece `Ir para o início`", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        state: "SUCCEEDED",
        cleanupState: "CLEAN",
        cleanupAt: "2026-09-14T12:09:00.000Z",
        reachedCount: 6,
      }),
    );
    renderScreen("teste-real-sucesso");

    expect(await screen.findByText("Tudo pronto!")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ir para o início" }),
    ).toBeInTheDocument();
  });

  test("limpeza completa: a tela só afirma a remoção com `CLEAN` lido", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        state: "SUCCEEDED",
        cleanupState: "CLEAN",
        cleanupAt: "2026-09-14T12:09:00.000Z",
        reachedCount: 6,
      }),
    );
    renderScreen("teste-real-sucesso");

    expect(
      await screen.findByText(/foram removidos do seu negócio/),
    ).toBeInTheDocument();
  });

  test("resíduo: a tela diz o que ficou, item a item", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({
        state: "SUCCEEDED",
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
        reachedCount: 6,
      }),
    );
    renderScreen("teste-real-sucesso");

    expect(
      await screen.findByText(/Nem tudo o que o teste criou pôde ser removido/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("pessoa de teste: precisa ser removida a mão"),
    ).toBeInTheDocument();
    // E não afirma a limpeza completa junto.
    expect(
      screen.queryByText(/foram removidos do seu negócio/),
    ).not.toBeInTheDocument();
  });

  test("limpeza pendente: a tela não afirma nada sobre remoção", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({ state: "SUCCEEDED", cleanupState: "PENDING", reachedCount: 6 }),
    );
    renderScreen("teste-real-sucesso");

    await screen.findByText("Tudo pronto!");
    expect(
      screen.queryByText(/foram removidos do seu negócio/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Nem tudo o que o teste criou/),
    ).not.toBeInTheDocument();
  });
});
