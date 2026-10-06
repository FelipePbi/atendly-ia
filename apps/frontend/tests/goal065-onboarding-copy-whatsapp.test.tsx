// @vitest-environment jsdom
/**
 * Goal065/WU-04 — "IA" nomeia a automação nos textos das etapas (Avenly
 * fica só como plataforma), a introdução do WhatsApp explica "um número por
 * negócio", e contatos ignorados troca "Tente novamente" por formato
 * esperado em erro de validação, mantendo a mensagem de tentar de novo só
 * em falha de rede/servidor.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type OnboardingState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const refreshSession = vi.fn();
const listConversations = vi.fn();
const setConversationIgnored = vi.fn();
const ignoreByPhone = vi.fn();
const listServiceCatalog = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    conversations: {
      list: listConversations,
      setIgnored: setConversationIgnored,
      ignoreByPhone,
    },
    onboarding: { get: getOnboarding, update: updateOnboarding },
    serviceCatalog: { create: vi.fn(), list: listServiceCatalog },
  }),
  useProductRuntime: () => ({
    refreshSession,
    setUnauthenticated: vi.fn(),
  }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyState());
  refreshSession.mockResolvedValue(null);
  listConversations.mockResolvedValue([]);
  listServiceCatalog.mockResolvedValue({
    editable: true,
    items: [],
    source: "AVENLY",
  });
});

async function renderStep(scenario: string, state: OnboardingState) {
  getOnboarding.mockResolvedValue(state);
  const user = userEvent.setup();
  const view = render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario={scenario as never} />
    </OnboardingRuntimeProvider>,
  );
  return { user, container: view.container };
}

// As etapas medidas pelo gate (§8 do Goal065), mais o estilo da IA.
const COPY_STEPS = [
  "boas-vindas",
  "segmento-e-nome",
  "modalidade",
  "endereco",
  "servico-nome",
  "servicos-adicionais",
  "dias-de-atendimento",
  "horarios",
  "agenda-avenly-pronta",
  "whatsapp",
  "tom-da-ia",
] as const;

// "Avenly" como nome da plataforma ou do produto, nunca como quem conversa,
// informa ou decide: o que sobra depois de tirar estes usos não pode citar
// "Avenly".
const PLATFORM_USES = [
  "Configure sua Avenly em poucos passos.",
  "Sua Agenda Avenly está pronta",
  "A Avenly organiza todas as suas conversas automaticamente.",
];

describe("textos das etapas: a automação se chama IA em todas as etapas do gate", () => {
  test.each(COPY_STEPS)(
    "%s não chama a automação de Avenly nem mostra termo técnico",
    async (scenario) => {
      const { container } = await renderStep(scenario, emptyState());
      await screen.findByRole("heading", { level: 1 });
      const content = container.querySelector(".onboarding-content");
      const text = PLATFORM_USES.reduce(
        (remaining, use) => remaining.split(use).join(""),
        content?.textContent ?? "",
      );
      expect(text).not.toMatch(/Avenly/);
      expect(text).not.toMatch(/\btoken\b|\bAPI\b|\bHTTP\b|VALIDATION_ERROR/);
    },
  );

  test("as duas frases citadas na evidência 8 do Goal falam da IA", async () => {
    const { onboardingScenarios } = await import(
      "@/features/onboarding/scenarios"
    );
    expect(onboardingScenarios["segmento-e-nome"][2]).toBe(
      "Isso ajuda a IA a usar nomes e exemplos mais próximos da sua rotina.",
    );
    expect(onboardingScenarios["servico-nome"][2]).toContain(
      "Comece pelo mais comum. Os outros você adiciona depois.",
    );
  });
});

describe("tom-da-ia: automação chamada de IA, Avenly só como plataforma", () => {
  test("o título pergunta pela IA, não pela Avenly", async () => {
    const { container } = await renderStep("tom-da-ia", emptyState());
    expect(
      await screen.findByRole("heading", {
        name: "Gostou da forma como a IA conversou?",
      }),
    ).toBeVisible();
    const stepBody = container.querySelector(".onboarding-content");
    expect(stepBody?.textContent).not.toMatch(/Avenly/);
  });
});

describe("whatsapp: introdução explica um número por negócio", () => {
  test("a lista de pontos contém 'Só um número por negócio.'", async () => {
    await renderStep("whatsapp", emptyState());
    expect(await screen.findByText("Só um número por negócio.")).toBeVisible();
  });

  test("'Conectar meu WhatsApp' é o principal e vem antes de 'Fazer isso depois' (QA O-41)", async () => {
    await renderStep("whatsapp", emptyState());
    const connect = await screen.findByRole("button", {
      name: "Conectar meu WhatsApp",
    });
    const later = screen.getByRole("button", { name: "Fazer isso depois" });
    expect(connect).toHaveClass("btn-primary");
    expect(later).not.toHaveClass("btn-primary");
    expect(
      connect.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Empilhados em largura total no celular: a barra de ações declara o
    // layout empilhado; a largura em si é medida pelo gate autenticado.
    expect(connect.closest(".onboarding-actions")).toHaveClass("is-stacked");
  });
});

const whatsappConnected: Partial<OnboardingState> = {
  whatsapp: { phoneNumber: "5511999990000", status: "CONNECTED" },
};

describe("contatos-ignorados: erro por telefone", () => {
  test("400 VALIDATION_ERROR mostra o formato esperado, sem 'Tente novamente'", async () => {
    ignoreByPhone.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        message: "Invalid phone.",
        requestId: "req-1",
        status: 400,
      }),
    );
    const { user } = await renderStep(
      "contatos-ignorados",
      { ...emptyState(), ...whatsappConnected },
    );
    await user.click(
      await screen.findByRole("button", { name: "Adicionar por telefone" }),
    );
    await user.type(screen.getByPlaceholderText("+55 11 99999-0000"), "123");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    const formatMessage = await screen.findByText(
      "Use o formato +55 11 99999-0000, com DDD.",
    );
    expect(formatMessage).toBeVisible();
    expect(screen.queryByText(/Tente novamente/)).toBeNull();
    expect(formatMessage.textContent).not.toContain("VALIDATION_ERROR");
    expect(formatMessage.textContent).not.toContain("token");
    expect(formatMessage.textContent).not.toContain("API");
    expect(formatMessage.textContent).not.toContain("HTTP");
  });

  test("falha de rede mantém a mensagem de tentar de novo", async () => {
    ignoreByPhone.mockRejectedValue(new TypeError("Failed to fetch"));
    const { user } = await renderStep(
      "contatos-ignorados",
      { ...emptyState(), ...whatsappConnected },
    );
    await user.click(
      await screen.findByRole("button", { name: "Adicionar por telefone" }),
    );
    await user.type(
      screen.getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 99999-0000",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(
      await screen.findByText(
        "Não foi possível marcar este número. Tente novamente.",
      ),
    ).toBeVisible();
  });

  test("500 do servidor mantém a mensagem de tentar de novo", async () => {
    ignoreByPhone.mockRejectedValue(
      new BffHttpError({
        code: "INTERNAL_ERROR",
        message: "boom",
        requestId: "req-2",
        status: 500,
      }),
    );
    const { user } = await renderStep(
      "contatos-ignorados",
      { ...emptyState(), ...whatsappConnected },
    );
    await user.click(
      await screen.findByRole("button", { name: "Adicionar por telefone" }),
    );
    await user.type(
      screen.getByPlaceholderText("+55 11 99999-0000"),
      "+55 11 99999-0000",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() =>
      expect(
        screen.getByText("Não foi possível marcar este número. Tente novamente."),
      ).toBeVisible(),
    );
  });
});
