// @vitest-environment jsdom
/**
 * Goal063 §3 — Configurações › IA sem interruptor, com o teste real.
 *
 * O que esta suíte prova, pelo que a usuária encontra:
 *
 * - não há checkbox em estado nenhum;
 * - IA ativa: "Pausar atendimento", com a confirmação que já existia, e
 *   nenhuma entrada para o teste;
 * - IA pausada com teste válido: "Retomar atendimento", que envia
 *   `enabled: true`, e nenhuma entrada para o teste;
 * - sem teste válido e com WhatsApp conectado: o texto diz que a IA só liga
 *   depois do teste real e a tela oferece o mesmo teste do onboarding
 *   (módulo compartilhado); teste superado por troca de canal conta como sem
 *   teste;
 * - sem teste válido e sem WhatsApp: o texto diz isso e leva a
 *   `/configuracoes/whatsapp`, sem oferecer o teste;
 * - a recusa `AI_ACTIVATION_TEST_REQUIRED` faz a tela reler o estado e
 *   mostrar o caso "sem teste válido", não um erro genérico;
 * - salvar o estilo envia o ligado lido, nunca um valor do formulário;
 * - nenhum texto contém termo técnico proibido.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type ActivationTestRun, BffHttpError, type SettingsState } from "@/data";

import { expectNoA11yViolations } from "./support/a11y";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getSettings = vi.fn();
const updateAi = vi.fn();
const getWhatsapp = vi.fn();
const getActivationTest = vi.fn();
const startActivationTest = vi.fn();
const restartActivationTest = vi.fn();
const statusGet = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: restartActivationTest,
      start: startActivationTest,
    },
    settings: { get: getSettings, updateAi },
    status: { get: statusGet },
    whatsapp: { get: getWhatsapp },
  }),
}));

// Conhecimento e "Outras informações" têm suítes próprias e não mudam aqui.
vi.mock("@/features/knowledge/KnowledgeSection", () => ({
  KnowledgeSection: () => null,
}));
vi.mock("@/features/knowledge/OtherInfoSection", () => ({
  OtherInfoSection: () => null,
}));

import { AiSettings } from "@/features/settings/AiSettings";

const MILESTONES = [
  "MESSAGE_SENT",
  "SERVICE_IDENTIFIED",
  "PRICE_INFORMED",
  "AVAILABILITY_CHECKED",
  "SLOT_SELECTED",
  "APPOINTMENT_CONFIRMED",
] as const;

function runFixture(overrides: Partial<ActivationTestRun> = {}): ActivationTestRun {
  const state = overrides.state ?? "SUCCEEDED";
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
    milestones: MILESTONES.map((milestone) => ({
      milestone,
      reached: state === "SUCCEEDED",
      reachedAt: state === "SUCCEEDED" ? "2026-09-14T12:01:00.000Z" : null,
      sourceKind: state === "SUCCEEDED" ? ("MESSAGE" as const) : null,
      sourceId: state === "SUCCEEDED" ? `fact-${milestone}` : null,
    })),
    ...overrides,
  };
}

function settingsFixture(
  ai: SettingsState["ai"] = { enabled: false, tone: "BALANCED" },
): SettingsState {
  return {
    ai,
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [],
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: "Rua Um, 100",
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: ["ON_SITE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

const CONNECTED = { phoneNumber: "5511999990000", status: "CONNECTED" };
const DISCONNECTED = { phoneNumber: null, status: "DISCONNECTED" };

const FORBIDDEN = /\b(token|API|HTTP|run|projeção|reconciliação|desired|effective)\b/i;

function renderAi(settings: SettingsState) {
  const onSaved = vi.fn();
  const utils = render(<AiSettings settings={settings} onSaved={onSaved} />);
  return { ...utils, onSaved };
}

/** O teste real aparece como seção própria, com o título "Teste real". */
function testSection() {
  return screen.queryByRole("region", { name: "Teste real" });
}

beforeEach(() => {
  for (const mock of [
    getSettings,
    updateAi,
    getWhatsapp,
    getActivationTest,
    startActivationTest,
    restartActivationTest,
    statusGet,
  ]) {
    mock.mockReset();
  }
  getWhatsapp.mockResolvedValue(CONNECTED);
  getActivationTest.mockResolvedValue(null);
});

describe("Configurações › IA: sem interruptor, estado lido e a ação dele", () => {
  test("IA ativa: 'Pausar atendimento' com confirmação, sem checkbox e sem teste", async () => {
    const user = userEvent.setup();
    const paused = settingsFixture({ enabled: false, tone: "CASUAL" });
    updateAi.mockResolvedValue(paused);
    const { container, onSaved } = renderAi(
      settingsFixture({ enabled: true, tone: "CASUAL" }),
    );

    expect(
      screen.getByText("A IA está ligada e atende seus clientes."),
    ).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(testSection()).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar teste" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Retomar atendimento" })).toBeNull();
    // Com a IA ativa não há teste a oferecer: a tela nem lê a execução.
    expect(getActivationTest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Pausar atendimento" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Pausar atendimento automático?",
    });
    expect(updateAi).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Pausar atendimento" }),
    );

    await waitFor(() => {
      expect(updateAi).toHaveBeenCalledWith({ enabled: false, tone: "CASUAL" });
    });
    expect(onSaved).toHaveBeenCalledWith(paused);
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  test("IA pausada com teste válido: 'Retomar atendimento' envia enabled:true, sem teste", async () => {
    const user = userEvent.setup();
    getActivationTest.mockResolvedValue(runFixture());
    const resumed = settingsFixture({ enabled: true, tone: "BALANCED" });
    updateAi.mockResolvedValue(resumed);
    const { container, onSaved } = renderAi(settingsFixture());

    const resume = await screen.findByRole("button", {
      name: "Retomar atendimento",
    });
    expect(screen.getByText(/está pausado/)).toBeVisible();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(testSection()).toBeNull();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);

    await user.click(resume);

    await waitFor(() => {
      expect(updateAi).toHaveBeenCalledWith({ enabled: true, tone: "BALANCED" });
    });
    expect(onSaved).toHaveBeenCalledWith(resumed);
  });

  test("sem teste válido, com WhatsApp: oferece o mesmo teste do onboarding e o inicia", async () => {
    const user = userEvent.setup();
    getActivationTest.mockResolvedValue(null);
    startActivationTest.mockResolvedValue(runFixture({ state: "RUNNING" }));
    const { container } = renderAi(settingsFixture());

    expect(
      await screen.findByText(/A IA só liga depois do teste real\./),
    ).toBeVisible();
    const section = await screen.findByRole("region", { name: "Teste real" });
    // A introdução é a do módulo compartilhado, a mesma do onboarding.
    expect(
      within(section).getByText(
        "Um cliente simulado pergunta o preço de um serviço e pede um horário.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retomar atendimento" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
    await expectNoA11yViolations(container);

    getActivationTest.mockResolvedValue(
      runFixture({ state: "RUNNING", finishedAt: null }),
    );
    await user.click(within(section).getByRole("button", { name: "Iniciar teste" }));

    await waitFor(() => {
      expect(startActivationTest).toHaveBeenCalledWith("5511999990000");
    });
    // Progresso compartilhado: os marcos lidos do servidor.
    expect(await within(section).findByText(/Mensagem enviada/)).toBeVisible();
    expect(
      within(section).getByRole("button", { name: "Ver resultado" }),
    ).toBeVisible();
  });

  test("teste que terminou bem mas foi superado por troca de canal conta como sem teste", async () => {
    getActivationTest.mockResolvedValue(
      runFixture({ supersededByChannelChange: true }),
    );
    renderAi(settingsFixture());

    const section = await screen.findByRole("region", { name: "Teste real" });
    expect(
      within(section).getByRole("button", { name: "Iniciar teste" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retomar atendimento" })).toBeNull();
  });

  test("sem teste válido e sem WhatsApp: leva a /configuracoes/whatsapp e não oferece o teste", async () => {
    getWhatsapp.mockResolvedValue(DISCONNECTED);
    const { container } = renderAi(settingsFixture());

    const connect = await screen.findByRole("link", { name: "Conectar WhatsApp" });
    expect(connect).toHaveAttribute("href", "/configuracoes/whatsapp");
    expect(
      screen.getByText(/o teste precisa do seu WhatsApp conectado/),
    ).toBeVisible();
    expect(testSection()).toBeNull();
    expect(screen.queryByRole("button", { name: "Iniciar teste" })).toBeNull();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  test("a recusa AI_ACTIVATION_TEST_REQUIRED relê o estado e mostra o caso sem teste válido", async () => {
    const user = userEvent.setup();
    // Leitura inicial: havia teste válido. Entre a leitura e o clique ele
    // deixou de valer; o BFF recusa e a tela relê.
    getActivationTest.mockResolvedValueOnce(runFixture());
    updateAi.mockRejectedValue(
      new BffHttpError({
        code: "AI_ACTIVATION_TEST_REQUIRED",
        message: "A successful, still-valid real activation test is required.",
        requestId: "req-1",
        status: 409,
      }),
    );
    getSettings.mockResolvedValue(settingsFixture());
    getActivationTest.mockResolvedValue(
      runFixture({ supersededByChannelChange: true }),
    );
    const { container } = renderAi(settingsFixture());

    await user.click(
      await screen.findByRole("button", { name: "Retomar atendimento" }),
    );

    const section = await screen.findByRole("region", { name: "Teste real" });
    expect(getSettings).toHaveBeenCalled();
    expect(
      within(section).getByRole("button", { name: "Iniciar teste" }),
    ).toBeVisible();
    expect(
      screen.getByText(/A IA só liga depois de um teste real que terminou bem/),
    ).toBeVisible();
    expect(screen.queryByText(/Não foi possível/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retomar atendimento" })).toBeNull();
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  test.each([
    ["ativa", true],
    ["desligada", false],
  ] as const)(
    "salvar o estilo com a IA %s envia o ligado lido, nunca um valor do formulário",
    async (_label, enabled) => {
      const user = userEvent.setup();
      updateAi.mockResolvedValue(settingsFixture({ enabled, tone: "CASUAL" }));
      renderAi(settingsFixture({ enabled, tone: "BALANCED" }));
      if (!enabled) await screen.findByRole("region", { name: "Teste real" });

      await user.click(screen.getByRole("radio", { name: /^Descontraída/ }));
      await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

      await waitFor(() => {
        expect(updateAi).toHaveBeenCalledWith({ enabled, tone: "CASUAL" });
      });
      expect(updateAi).toHaveBeenCalledTimes(1);
    },
  );
});
