// @vitest-environment jsdom
/**
 * Goal099 — as etapas de IA e WhatsApp iguais aos quadros 3.1, 4.1, 4.2 e 4.6.
 *
 * O painel de conexão e as telas são os reais; só o runtime é dublê.
 *
 * 1. O eyebrow das etapas do capítulo WhatsApp é "WhatsApp"; a demonstração
 *    segue "Sua IA".
 * 2. `whatsapp`: título do quadro, sem descrição, quarta promessa completa.
 * 3. `whatsapp-conectar`: abre na fase de consentimento, e só a fase seguinte
 *    conecta, com `consentAccepted: true`.
 * 4. Vinculação falha: a tela volta ao consentimento, desmarcado.
 * 5. Configurações › WhatsApp segue numa tela só, sem fase.
 * 6. `demonstracao-da-ia`: as frases do quadro, os três eventos, sem artigo
 *    fixo antes do nome do serviço.
 * 7. `teste-real`: título, descrição, prévia e três itens do quadro; a
 *    introdução de Configurações › IA continua a da baseline.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ActivationTestRun, OnboardingState, SettingsState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const connectWhatsapp = vi.fn();
const reconnectWhatsapp = vi.fn();
const qrWhatsapp = vi.fn();
const disconnectWhatsapp = vi.fn();
const getActivationTest = vi.fn();
const startActivationTest = vi.fn();
const restartActivationTest = vi.fn();
const getSettings = vi.fn();
const statusGet = vi.fn();
const serviceCatalogList = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    activationTest: {
      get: getActivationTest,
      restart: restartActivationTest,
      start: startActivationTest,
    },
    auth: { logout: vi.fn() },
    conversations: { ignoreByPhone: vi.fn(), list: vi.fn(), setIgnored: vi.fn() },
    // Goal104: a linha "Avisar quando a IA marcar um horário" lê a preferência; sem ela, some.
    notifications: {
      getPreferences: () => Promise.reject(new Error("fora do escopo")),
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    serviceCatalog: { create: vi.fn(), list: serviceCatalogList },
    settings: { get: getSettings, updateAi: vi.fn() },
    status: { get: statusGet },
    whatsapp: {
      connect: connectWhatsapp,
      disconnect: disconnectWhatsapp,
      get: getWhatsapp,
      qr: qrWhatsapp,
      reconnect: reconnectWhatsapp,
    },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/features/knowledge/KnowledgeSection", () => ({
  KnowledgeSection: () => null,
}));
vi.mock("@/features/knowledge/OtherInfoSection", () => ({
  OtherInfoSection: () => null,
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import type { OnboardingScenario } from "@/features/onboarding/scenarios";
import { AiSettings } from "@/features/settings/AiSettings";
import { WhatsAppSettings } from "@/features/settings/WhatsAppSettings";

const CONSENT_TEXT =
  "Entendo que as conversas deste número poderão ser processadas e armazenadas para oferecer os recursos da Atendly.";

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return {
    ai: { tone: "PROFESSIONAL" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [
        {
          active: true,
          dayOfWeek: 5,
          endTime: "18:00",
          id: "rule-5",
          startTime: "14:00",
        },
      ],
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: null,
      category: "Cabelo",
      modalities: ["ONLINE"],
      name: "Studio Aurora",
      timezone: "America/Sao_Paulo",
    },
    calendar: {
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
    completed: false,
    completedAt: null,
    service: {
      active: true,
      bufferAfterMinutes: 0,
      bufferBeforeMinutes: 0,
      durationMinutes: 45,
      id: "svc-1",
      name: "Corte feminino",
      needsReview: false,
      price: 90,
      priceType: "FIXED",
    },
    whatsapp: null,
    ...overrides,
  };
}

function settingsFixture(): SettingsState {
  return {
    ai: { enabled: false, tone: "BALANCED" },
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

function runFixture(): ActivationTestRun {
  return {
    appointmentId: null,
    attempts: 1,
    channelId: "channel-1",
    cleanupAt: null,
    cleanupResidue: [],
    cleanupState: "PENDING",
    completedStep: null,
    currentStep: null,
    failedStep: null,
    failedStepLabel: null,
    failureCode: null,
    finishedAt: null,
    id: "run-1",
    maxAttempts: 3,
    milestones: [],
    pausedAt: null,
    startedAt: "2026-09-30T15:00:00.000Z",
    state: "RUNNING",
    supersededByChannelChange: false,
    terminal: false,
  } as unknown as ActivationTestRun;
}

function stubMatchMedia(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }),
    writable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubMatchMedia(true);
  getWhatsapp.mockResolvedValue(null);
  getActivationTest.mockResolvedValue(null);
  getSettings.mockResolvedValue(settingsFixture());
  statusGet.mockResolvedValue({ ai: { state: "OFF" } });
  updateOnboarding.mockResolvedValue(state());
  completeOnboarding.mockResolvedValue(state());
  refreshSession.mockResolvedValue(null);
  serviceCatalogList.mockResolvedValue({
    editable: true,
    items: [],
    source: "ATENDLY",
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

async function renderScreen(
  scenario: OnboardingScenario,
  current: OnboardingState = state(),
) {
  getOnboarding.mockResolvedValue(current);
  const utils = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario} />
    </OnboardingRuntimeProvider>,
  );
  await screen.findByRole("heading", { level: 1 });
  return utils;
}

function eyebrow(container: HTMLElement): string {
  return container.querySelector(".onboarding-eyebrow")?.textContent ?? "";
}

const WAITING_QR = {
  connection: {
    connectedAt: null,
    id: "wa-1",
    phoneNumber: null,
    status: "WAITING_QR",
    updatedAt: "2026-09-27T12:00:00.000Z",
  },
  expiresAt: null,
  pairingCode: null,
  qrcode: "qr-1",
};

describe("1. o eyebrow é o capítulo", () => {
  test.each([
    ["whatsapp", "WhatsApp"],
    ["whatsapp-conectar", "WhatsApp"],
    ["teste-real", "WhatsApp"],
    ["demonstracao-da-ia", "Sua IA"],
  ] as const)("%s mostra %s", async (scenario, expected) => {
    const { container } = await renderScreen(scenario);
    expect(eyebrow(container)).toBe(expected);
  });
});

describe("2. whatsapp (4.1): título do quadro, sem descrição", () => {
  test("título do quadro, nenhuma descrição e a quarta promessa completa", async () => {
    const { container } = await renderScreen("whatsapp");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Agora vamos colocar sua IA para atender de verdade.",
      }),
    ).toBeVisible();
    expect(container.querySelector(".onboarding-heading > p")).toBeNull();
    const promises = [...container.querySelectorAll(".onboarding-points li")];
    expect(promises).toHaveLength(4);
    expect(promises[3].textContent).toMatch(/família, amigos, quem quiser\.$/u);
    expect(
      screen.getByRole("button", { name: "Conectar meu WhatsApp" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Fazer isso depois" }),
    ).toBeVisible();
  });
});

describe("3. whatsapp-conectar (4.2): fase de consentimento", () => {
  test("abre no consentimento, sem conexão; Continuar só depois de checkbox e resposta; só a fase seguinte conecta", async () => {
    const user = userEvent.setup();
    await renderScreen("whatsapp-conectar");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Antes de conectar" }),
    ).toBeVisible();
    const checkbox = await screen.findByRole("checkbox", { name: CONSENT_TEXT });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText("Como prefere conectar?")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Conectar WhatsApp" }),
    ).not.toBeInTheDocument();

    const continuar = screen.getByRole("button", { name: "Continuar" });
    expect(screen.getAllByRole("button", { name: "Continuar" })).toHaveLength(1);
    expect(continuar).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "Não, só trabalho" }));
    expect(continuar).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Sim, também" }));
    expect(screen.getByText(/você continua no controle/i)).toBeVisible();
    expect(continuar).toBeDisabled();

    await user.click(continuar);
    expect(connectWhatsapp).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    await user.click(checkbox);
    expect(continuar).toBeEnabled();
    await user.click(continuar);
    expect(connectWhatsapp).not.toHaveBeenCalled();

    const connect = await screen.findByRole("button", {
      name: "Conectar WhatsApp",
    });
    expect(screen.getByText("Como prefere conectar?")).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Continuar" })).toHaveLength(1);

    connectWhatsapp.mockResolvedValue(WAITING_QR);
    await user.click(connect);
    expect(connectWhatsapp).toHaveBeenCalledWith({
      consentAccepted: true,
      mode: "QR",
    });
  });

  test("com a resposta mas sem o checkbox, Continuar segue desabilitado", async () => {
    const user = userEvent.setup();
    await renderScreen("whatsapp-conectar");
    await user.click(await screen.findByRole("radio", { name: "Não, só trabalho" }));
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(connectWhatsapp).not.toHaveBeenCalled();
  });
});

describe("4. vinculação falha: volta ao consentimento", () => {
  test("depois do erro, a fase de consentimento volta com o checkbox desmarcado", async () => {
    const user = userEvent.setup();
    await renderScreen("whatsapp-conectar");
    await user.click(await screen.findByRole("checkbox", { name: CONSENT_TEXT }));
    await user.click(screen.getByRole("radio", { name: "Não, só trabalho" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    connectWhatsapp.mockRejectedValue(new Error("falhou"));
    await user.click(
      await screen.findByRole("button", { name: "Conectar WhatsApp" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Antes de conectar" }),
    ).toBeVisible();
    expect(screen.getByRole("checkbox", { name: CONSENT_TEXT })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Conectar WhatsApp" }),
    ).not.toBeInTheDocument();
  });
});

describe("5. Configurações › WhatsApp não tem fase", () => {
  test("consentimento, pergunta, escolha de modo e Conectar WhatsApp na mesma tela", async () => {
    render(<WhatsAppSettings onStatusChange={() => {}} />);
    const connect = await screen.findByRole("button", {
      name: "Conectar WhatsApp",
    });
    expect(screen.getByRole("checkbox", { name: CONSENT_TEXT })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Sim, também" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Não, só trabalho" })).toBeVisible();
    expect(screen.getByText("Como prefere conectar?")).toBeVisible();
    expect(connect).toBeDisabled();
    expect(
      screen.queryByRole("heading", { name: "Antes de conectar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();
  });
});

describe("6. demonstracao-da-ia (3.1): frases do quadro", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Quarta-feira, 2026-09-30, meio-dia em America/Sao_Paulo.
    vi.setSystemTime(new Date("2026-09-30T15:00:00.000Z"));
  });

  test("conversa com os dados do rascunho, os três eventos e o fim do quadro, sem artigo fixo", async () => {
    getOnboarding.mockResolvedValue(state());
    render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="demonstracao-da-ia" />
      </OnboardingRuntimeProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const chat = screen.getByRole("log");
    const texts = [...chat.children].map(
      (node) => node.textContent?.replace(/sua IA$/u, "") ?? "",
    );
    expect(texts).toHaveLength(11);
    expect(texts[0]).toBe("Oi! Quanto custa Corte feminino?");
    expect(texts[2]).toMatch(/custa R\$\s90,00\. Leva 45 min\./u);
    expect(texts[3]).toBe("Quero sim! Tem sexta à tarde?");
    expect(texts[5]).toBe("Tenho sexta às 14h, 15h30 ou 17h. Qual fica melhor?");
    expect(texts[6]).toBe("15h30");
    expect(texts[10]).toBe("Confirmado! Te espero sexta às 15h30 😊");

    const events = [...chat.querySelectorAll(".onboarding-demo-event")].map(
      (node) => node.textContent,
    );
    expect(events).toEqual([
      "Serviço identificado · Corte feminino",
      "Agenda consultada · 3 horários livres na sexta",
      "Agendamento simulado · nada foi marcado",
    ]);
    expect(within(chat).queryByText(/Combinado! Te espero lá\./u)).toBeNull();
    expect(chat.textContent).not.toMatch(/\b(o|um|do|no) corte feminino/iu);
  });
});

describe("7. teste-real (4.6): introdução do quadro", () => {
  test("título, descrição, prévia sem serviço, três itens e Iniciar teste como está", async () => {
    const user = userEvent.setup();
    getWhatsapp.mockResolvedValue({
      phoneNumber: "+5511999990000",
      status: "CONNECTED",
    });
    startActivationTest.mockResolvedValue(runFixture());
    const { container } = await renderScreen("teste-real");

    expect(
      screen.getByRole("heading", { level: 1, name: "Vamos fazer um teste real" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Um número da Atendly vai enviar uma mensagem no seu WhatsApp simulando um cliente. Você só observa — a IA faz o atendimento sozinha.",
      ),
    ).toBeVisible();

    const preview = container.querySelector(".activation-test-preview");
    expect(preview).not.toBeNull();
    const previewScope = within(preview as HTMLElement);
    expect(previewScope.getByText("Atendly · Teste")).toBeVisible();
    expect(previewScope.getByText(/Esta é uma conversa de teste da Atendly/)).toBeVisible();
    expect(previewScope.getByText("Oi! Quanto custa o atendimento?")).toBeVisible();
    expect(preview?.textContent).not.toMatch(/Corte feminino/iu);

    const items = [...container.querySelectorAll(".activation-test-checks li")].map(
      (node) => node.textContent,
    );
    expect(items).toEqual([
      "A conversa chega identificada como teste",
      "A IA informa preço, consulta a agenda e confirma um horário de verdade",
      "No fim, o agendamento e o cliente de teste são apagados, e sua IA é ativada",
    ]);
    expect(screen.queryByText(/Leva cerca de/)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".btn-primary")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Iniciar teste" }));
    await waitFor(() =>
      expect(startActivationTest).toHaveBeenCalledWith("+5511999990000"),
    );
    expect(push).toHaveBeenCalledWith("/onboarding/teste-real-progresso");
  });

  test("Configurações › IA continua com a introdução da baseline, sem prévia", async () => {
    getWhatsapp.mockResolvedValue({
      phoneNumber: "+5511999990000",
      status: "CONNECTED",
    });
    render(<AiSettings settings={settingsFixture()} onSaved={vi.fn()} />);
    const section = await screen.findByRole("region", { name: "Teste real" });
    const items = [...section.querySelectorAll(".onboarding-points li")].map(
      (node) => node.textContent,
    );
    expect(items).toEqual([
      "A conversa começa com um aviso separado: “Esta é uma conversa de teste da Atendly.”",
      "Um cliente simulado pergunta o preço de um serviço e pede um horário.",
      "A IA responde sozinha, consulta sua agenda e marca um atendimento de teste de verdade.",
      "No fim, o agendamento e o cliente de teste são removidos, e sua IA é ativada.",
    ]);
    expect(section.querySelector(".activation-test-preview")).toBeNull();
    expect(
      within(section).getByRole("button", { name: "Iniciar teste" }),
    ).toBeVisible();
  });
});
