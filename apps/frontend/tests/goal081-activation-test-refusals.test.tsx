// @vitest-environment jsdom
/**
 * Goal081/WU-02 — as recusas do teste real dizem o que aconteceu.
 *
 * - sem o número da plataforma, o onboarding e Configurações › IA mostram o
 *   mesmo texto de indisponibilidade, sem convite a tentar de novo e sem
 *   progresso; no onboarding o caminho de pular continua visível;
 * - as seis recusas 409 têm texto próprio e nenhuma vira "itens obrigatórios
 *   pendentes";
 * - `onboardingError` distingue dado recusado, serviço fora do ar e falha
 *   nossa, e mantém o texto do 409 de conclusão.
 */

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type OnboardingState, type SettingsState } from "@/data";
import { onboardingError } from "@/features/onboarding/blocks/shared";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

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
const getSettings = vi.fn();
const statusGet = vi.fn();
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
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: vi.fn(),
    },
    settings: { get: getSettings, updateAi: vi.fn() },
    status: { get: statusGet },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({ refreshSession, setUnauthenticated: vi.fn() }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));
vi.mock("@/features/knowledge/KnowledgeSection", () => ({
  KnowledgeSection: () => null,
}));
vi.mock("@/features/knowledge/OtherInfoSection", () => ({
  OtherInfoSection: () => null,
}));

import { AiSettings } from "@/features/settings/AiSettings";

const UNAVAILABLE = /O teste real não está disponível neste ambiente/;

function upstream(upstreamCode: string, status: number) {
  return new BffHttpError({
    code: "UPSTREAM_ERROR",
    details: { upstreamCode },
    message: "raw upstream message",
    requestId: "req-g081",
    status,
  });
}

const platformMissing = () => upstream("PLATFORM_NUMBER_NOT_CONFIGURED", 502);

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
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: { phoneNumber: "+5511999990000", status: "CONNECTED" },
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

async function startOnboardingTest() {
  const user = userEvent.setup();
  render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="teste-real" />
    </OnboardingRuntimeProvider>,
  );
  await user.click(await screen.findByRole("button", { name: "Iniciar teste" }));
  await waitFor(() => expect(startActivationTest).toHaveBeenCalled());
}

async function startSettingsTest() {
  const user = userEvent.setup();
  render(<AiSettings settings={settingsFixture()} onSaved={vi.fn()} />);
  const section = await screen.findByRole("region", { name: "Teste real" });
  await user.click(within(section).getByRole("button", { name: "Iniciar teste" }));
  await waitFor(() => expect(startActivationTest).toHaveBeenCalled());
}

beforeEach(() => {
  vi.clearAllMocks();
  getOnboarding.mockResolvedValue(onboardingFixture());
  getWhatsapp.mockResolvedValue({
    phoneNumber: "+5511999990000",
    status: "CONNECTED",
  });
  getActivationTest.mockResolvedValue(null);
  statusGet.mockResolvedValue({ ai: { state: "OFF" } });
});

describe("sem o número da plataforma, o teste real diz que está indisponível", () => {
  test("onboarding: texto de indisponibilidade, sem convite a tentar de novo, sem navegar, pular visível", async () => {
    startActivationTest.mockRejectedValue(platformMissing());
    await startOnboardingTest();

    const message = await screen.findByText(UNAVAILABLE);
    expect(message).toBeVisible();
    expect(screen.queryByText(/Tente novamente/i)).toBeNull();
    expect(screen.queryByText(/Não foi possível salvar esta etapa/)).toBeNull();
    expect(screen.queryByText(/Ainda há itens obrigatórios/)).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText("Mensagem enviada")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Fazer isso depois" }),
    ).toBeVisible();
  });

  test("Configurações › IA: o mesmo texto, e não 'Não foi possível iniciar o teste agora.'", async () => {
    startActivationTest.mockRejectedValue(platformMissing());
    await startSettingsTest();

    const message = await screen.findByText(UNAVAILABLE);
    expect(message).toBeVisible();
    expect(
      screen.queryByText("Não foi possível iniciar o teste agora."),
    ).toBeNull();
    expect(screen.queryByText(/Tente novamente/i)).toBeNull();
  });

  test("os dois consumidores mostram exatamente a mesma frase", async () => {
    startActivationTest.mockRejectedValue(platformMissing());
    await startOnboardingTest();
    const onboardingText = (await screen.findByText(UNAVAILABLE)).textContent;
    cleanup();

    await startSettingsTest();
    const settingsText = (await screen.findByText(UNAVAILABLE)).textContent;

    expect(settingsText).toBe(onboardingText);
  });
});

const refusals409: Array<{
  name: string;
  error: () => BffHttpError;
  text: RegExp;
}> = [
  {
    name: "ACTIVATION_TEST_AI_ALREADY_ACTIVE",
    error: () =>
      new BffHttpError({
        code: "ACTIVATION_TEST_AI_ALREADY_ACTIVE",
        message: "raw",
        requestId: "req-g081",
        status: 409,
      }),
    text: /Sua IA já está ativa, então não há teste a fazer/,
  },
  {
    name: "ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED",
    error: () => upstream("ACTIVATION_TEST_WHATSAPP_NOT_CONNECTED", 409),
    text: /Seu WhatsApp não está conectado/,
  },
  {
    name: "ACTIVATION_TEST_TENANT_PHONE_UNKNOWN",
    error: () => upstream("ACTIVATION_TEST_TENANT_PHONE_UNKNOWN", 409),
    text: /Não reconhecemos o número de WhatsApp do seu negócio/,
  },
  {
    name: "ACTIVATION_TEST_NO_ELIGIBLE_SERVICE",
    error: () => upstream("ACTIVATION_TEST_NO_ELIGIBLE_SERVICE", 409),
    text: /ao menos um serviço ativo que aceite agendamento/,
  },
  {
    name: "ACTIVATION_TEST_NO_AVAILABILITY",
    error: () => upstream("ACTIVATION_TEST_NO_AVAILABILITY", 409),
    text: /não tem nenhum horário livre para o serviço do teste/,
  },
  {
    name: "ACTIVATION_TEST_ALREADY_RUNNING",
    error: () => upstream("ACTIVATION_TEST_ALREADY_RUNNING", 409),
    text: /Já existe um teste em andamento/,
  },
];

describe("as seis recusas 409 do teste real têm texto próprio", () => {
  test.each(refusals409)("$name", async ({ error, text }) => {
    startActivationTest.mockRejectedValue(error());
    await startOnboardingTest();

    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByText(/Ainda há itens obrigatórios pendentes/)).toBeNull();
    expect(screen.queryByText(/Não foi possível salvar esta etapa/)).toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  test("Configurações › IA mostra o mesmo texto de cada recusa", async () => {
    for (const { error, text } of refusals409) {
      cleanup();
      vi.clearAllMocks();
      getWhatsapp.mockResolvedValue({
        phoneNumber: "+5511999990000",
        status: "CONNECTED",
      });
      getActivationTest.mockResolvedValue(null);
      statusGet.mockResolvedValue({ ai: { state: "OFF" } });
      startActivationTest.mockRejectedValue(error());
      await startSettingsTest();
      expect(await screen.findByText(text)).toBeVisible();
    }
  });

  test("erro fora dos sete códigos continua subindo e cai no aviso de cada tela", async () => {
    startActivationTest.mockRejectedValue(
      new BffHttpError({
        code: "INTERNAL_ERROR",
        message: "raw",
        requestId: "req-g081",
        status: 500,
      }),
    );
    await startSettingsTest();
    expect(
      await screen.findByText("Não foi possível iniciar o teste agora."),
    ).toBeVisible();
  });

  test("nenhum texto de recusa nomeia variável de ambiente", async () => {
    const seen: string[] = [];
    for (const error of [platformMissing, ...refusals409.map((r) => r.error)]) {
      cleanup();
      vi.clearAllMocks();
      getOnboarding.mockResolvedValue(onboardingFixture());
      getWhatsapp.mockResolvedValue({
        phoneNumber: "+5511999990000",
        status: "CONNECTED",
      });
      getActivationTest.mockResolvedValue(null);
      startActivationTest.mockRejectedValue(error());
      await startOnboardingTest();
      const alert = await screen.findByRole("alert");
      seen.push(alert.textContent ?? "");
    }
    expect(seen).toHaveLength(7);
    for (const text of seen) {
      expect(text).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
  });
});

describe("onboardingError em três classes, mais o 409 de conclusão", () => {
  const http = (status: number, code = "X", details?: unknown) =>
    new BffHttpError({ code, details, message: "raw", requestId: "r", status });

  const dataRefused = onboardingError(http(400, "VALIDATION_ERROR"));
  const serviceDown = onboardingError(http(503));
  const ourFault = onboardingError(http(500));
  const completion = onboardingError(http(409));

  test("400 sem campo pede para revisar o que foi preenchido", () => {
    expect(dataRefused).toMatch(/Revise o que você preencheu/);
  });

  test.each([0, 502, 503, 504])(
    "status %i diz que não foi possível falar com o servidor",
    (status) => {
      expect(onboardingError(http(status))).toMatch(
        /Não foi possível falar com o servidor agora/,
      );
    },
  );

  test("500 diz que algo deu errado do nosso lado", () => {
    expect(ourFault).toMatch(/Algo deu errado do nosso lado/);
  });

  test("409 mantém o texto de hoje", () => {
    expect(completion).toBe(
      "Ainda há itens obrigatórios pendentes. Revise negócio, agenda, serviço, disponibilidade e tom da IA.",
    );
  });

  test("as quatro classes são textos distintos e a frase única deixou de existir", () => {
    expect(new Set([dataRefused, serviceDown, ourFault, completion]).size).toBe(4);
    for (const text of [dataRefused, serviceDown, ourFault, completion]) {
      expect(text).not.toBe("Não foi possível salvar esta etapa. Tente novamente.");
    }
  });
});
