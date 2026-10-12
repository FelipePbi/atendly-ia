// @vitest-environment jsdom
/**
 * Goal018 (WU-11): prova transversal de acessibilidade das telas novas ou
 * reescritas por este Goal — o bloco de negócio (onboarding e Configurações),
 * a orientação/conclusão do bloco WhatsApp e o checklist da Home já tem sua
 * própria prova em `goal018-dashboard-status.test.tsx`.
 *
 * As suítes de cada Work Unit (`goal018-onboarding-reachability`,
 * `goal018-business-block`) já provam comportamento pelo que a usuária
 * encontra, mas nenhuma delas roda o axe. Esta suíte fecha essa lacuna, no
 * mesmo padrão que `goal017-a11y.test.tsx` fechou para Conversas.
 *
 * O que esta suíte não prova: layout real, largura de viewport, contraste
 * computado. Isso é `npm run validate:ui`, não jsdom.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, SettingsState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";
import { composedAddress, FLORES_ADDRESS } from "./support/address";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const completeOnboarding = vi.fn();
const getSettings = vi.fn();
const getWhatsapp = vi.fn();
const logout = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    // Goal104: o resumo de "O que a IA sabe responder" lê a base; sem ela, a linha fica sem valor.
    knowledge: {
      getOtherInfo: () => Promise.reject(new Error("fora do escopo")),
      list: () => Promise.reject(new Error("fora do escopo")),
    },
    onboarding: {
      complete: completeOnboarding,
      get: getOnboarding,
      update: updateOnboarding,
    },
    settings: { get: getSettings },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: { businessProfile: { businessName: "Studio Marina" } },
    setUnauthenticated: vi.fn(),
  }),
}));

vi.mock("@/features/whatsapp/WhatsAppConnectionPanel", () => ({
  WhatsAppConnectionPanel: () => <div>Painel de conexão do WhatsApp</div>,
}));

function emptyOnboardingState(): OnboardingState {
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

const businessDone = {
  business: {
    category: "Beleza",
    name: "Studio Aurora",
    timezone: "America/Sao_Paulo",
  },
};
const calendarDone = {
  calendar: {
    integration: null,
    source: "AVENLY" as const,
    timezone: "America/Sao_Paulo",
  },
};
const serviceDone = {
  service: {
    active: true,
    durationMinutes: 60,
    id: "svc-1",
    name: "Corte",
    price: 100,
    priceType: "FIXED" as const,
  },
};
const toneDone = { ai: { tone: "PROFESSIONAL" as const } };

function settingsFixture(
  overrides: Partial<NonNullable<SettingsState["business"]>> = {},
): SettingsState {
  return {
    ai: { enabled: false, tone: null },
    availability: null,
    business: {
      address: null,
      category: "Beleza",
      contextProjectionStatus: "PROJECTED",
      currency: "BRL",
      language: "pt-BR",
      modalities: [],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
      ...overrides,
    },
    calendar: {
      capabilities: {
        createAppointments: false,
        manageAvailability: false,
        manageCustomers: false,
        manageServices: false,
        migrate: false,
      },
      integration: null,
      source: null,
      timezone: null,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  updateOnboarding.mockResolvedValue(emptyOnboardingState());
  completeOnboarding.mockResolvedValue(emptyOnboardingState());
  refreshSession.mockResolvedValue(null);
  getWhatsapp.mockResolvedValue(null);
});

describe("onboarding: bloco Seu negócio", () => {
  // Goal065/WU-02: "dados-do-negocio" virou quatro etapas (boas-vindas,
  // segmento-e-nome, modalidade, endereco); as duas provas de a11y cobrem os
  // dois extremos com campo de verdade.
  test("segmento-e-nome sem local próprio selecionado", async () => {
    getOnboarding.mockResolvedValue(emptyOnboardingState());
    const { container } = render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="segmento-e-nome" />
      </OnboardingRuntimeProvider>,
    );
    // Goal065 rodada 2: o campo segue o vault ("Como seus clientes conhecem
    // você?"), depois do segmento.
    await screen.findByLabelText("Como seus clientes conhecem você?");
    await expectNoA11yViolations(container);
  });

  test("endereco com ON_SITE já gravado, campo de endereço visível", async () => {
    getOnboarding.mockResolvedValue({
      ...emptyOnboardingState(),
      business: {
        address: composedAddress(FLORES_ADDRESS),
        addressParts: FLORES_ADDRESS,
        category: "Beleza",
        modalities: ["ON_SITE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    });
    const { container } = render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="endereco" />
      </OnboardingRuntimeProvider>,
    );
    // Os campos abrem com as partes gravadas.
    await waitFor(() =>
      expect(screen.getByLabelText("CEP")).toHaveValue("01310-100"),
    );
    expect(screen.getByLabelText("Estado")).toHaveValue("SP");
    await expectNoA11yViolations(container);
  });
});

describe("onboarding: bloco WhatsApp", () => {
  test("whatsapp: orientação sobre número pessoal antes de oferecer a conexão", async () => {
    getOnboarding.mockResolvedValue({
      ...emptyOnboardingState(),
      ...businessDone,
      ...calendarDone,
      ...serviceDone,
      ...toneDone,
    });
    const { container } = render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="whatsapp" />
      </OnboardingRuntimeProvider>,
    );
    await screen.findByText("Só um número por negócio.");
    await expectNoA11yViolations(container);
  });

  test("whatsapp-concluido: conclusão sem WhatsApp, com as duas ações do vault", async () => {
    getOnboarding.mockResolvedValue({
      ...emptyOnboardingState(),
      ...businessDone,
      ...calendarDone,
      ...serviceDone,
      ...toneDone,
    });
    const { container } = render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="whatsapp-concluido" />
      </OnboardingRuntimeProvider>,
    );
    await screen.findByRole("heading", {
      level: 1,
      name: "Sua Avenly está configurada.",
    });
    await expectNoA11yViolations(container);
  });
});

describe("configurações/negocio: BusinessSettings", () => {
  test("sem local próprio selecionado", async () => {
    getSettings.mockResolvedValue(settingsFixture({ modalities: ["ONLINE"] }));
    const { container } = render(
      <ShellConfigProvider>
        <ProductSettingsScreen scenario="business" />
      </ShellConfigProvider>,
    );
    // Goal088 (N1): as linhas primeiro; o editor abre sob demanda pela linha com `›`.
    const row = await screen.findByRole("button", { name: /^Nome/ });
    await expectNoA11yViolations(container);
    await userEvent.click(row);
    await screen.findByLabelText("Nome do negócio");
    await expectNoA11yViolations(container);
  });

  test("com ON_SITE gravado, campo de endereço e aviso de projeção pendente visíveis", async () => {
    getSettings.mockResolvedValue(
      settingsFixture({
        address: composedAddress(FLORES_ADDRESS),
        addressParts: FLORES_ADDRESS,
        contextProjectionStatus: "PENDING",
        modalities: ["ON_SITE"],
      }),
    );
    const { container } = render(
      <ShellConfigProvider>
        <ProductSettingsScreen scenario="business" />
      </ShellConfigProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: /^Endereço/ }));
    const group = await screen.findByRole("group", {
      name: "Endereço do seu espaço",
    });
    expect(within(group).getByLabelText("CEP")).toHaveValue("01310-100");
    await expectNoA11yViolations(container);
  });
});
