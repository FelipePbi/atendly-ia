// @vitest-environment jsdom
/**
 * Goal018/WU-11 — o bloco "Seu negócio" coleta segmento (frequentes + "Outro"),
 * nome, modalidades múltiplas e endereço condicional, tanto no onboarding
 * (`dados-do-negocio`) quanto em `configuracoes/negocio` (`ProductSettingsScreen`
 * como está, sem redecomposição).
 *
 * O que esta suíte prova pelo que a usuária encontra:
 * - nenhuma modalidade escolhida bloqueia o avanço/salvamento com uma
 *   mensagem, nas duas telas;
 * - `ON_SITE` exige endereço não vazio antes de salvar, nas duas telas;
 * - desmarcar `ON_SITE` depois de ter digitado um endereço preserva o
 *   endereço já gravado: o payload não envia a chave `address` (§1 do Goal018:
 *   retirar ON_SITE não apaga o endereço, só deixa de exigi-lo);
 * - em Configurações, o payload de `updateBusiness` é exatamente o que a
 *   tela mostra, e o aviso de projeção pendente aparece quando o servidor
 *   devolve `contextProjectionStatus: "PENDING"`.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, SettingsState } from "@/data";
import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const updateOnboarding = vi.fn();
const getSettings = vi.fn();
const updateBusiness = vi.fn();
const getWhatsapp = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    onboarding: { get: getOnboarding, update: updateOnboarding },
    settings: { get: getSettings, updateBusiness },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession,
    session: { businessProfile: { businessName: "Studio Marina" } },
    setUnauthenticated: vi.fn(),
  }),
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
  refreshSession.mockResolvedValue(null);
  getWhatsapp.mockResolvedValue(null);
});

describe("onboarding: dados-do-negocio", () => {
  async function renderStep() {
    getOnboarding.mockResolvedValue(emptyOnboardingState());
    const user = userEvent.setup();
    render(
      <OnboardingRuntimeProvider>
        <OnboardingScreen scenario="dados-do-negocio" />
      </OnboardingRuntimeProvider>,
    );
    await screen.findByLabelText("Nome do negócio");
    return user;
  }

  test("sem modalidade escolhida, bloqueia com mensagem e não salva", async () => {
    const user = await renderStep();
    await user.type(screen.getByLabelText("Nome do negócio"), "Studio Aurora");
    await user.click(screen.getByRole("button", { name: "Outro" }));
    await user.type(
      screen.getByPlaceholderText("Qual é o seu segmento?"),
      "Beleza",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Escolha ao menos uma modalidade de atendimento."),
    ).toBeVisible();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("ON_SITE com endereço só espaços bloqueia com mensagem e não salva", async () => {
    // O atributo HTML `required` já barra o campo totalmente vazio no
    // navegador; a prova real do trim() em `persistBusinessStep` é um valor
    // só com espaços, que passa pela validação nativa e só é pego aqui —
    // o mesmo caso que a suíte de integração do BFF cobre com `"   "`.
    const user = await renderStep();
    await user.type(screen.getByLabelText("Nome do negócio"), "Studio Aurora");
    await user.click(screen.getByRole("button", { name: "Outro" }));
    await user.type(
      screen.getByPlaceholderText("Qual é o seu segmento?"),
      "Beleza",
    );
    await user.click(screen.getByText("Local próprio"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "   ",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(
      await screen.findByText("Informe o endereço do seu espaço."),
    ).toBeVisible();
    expect(updateOnboarding).not.toHaveBeenCalled();
  });

  test("ON_SITE com endereço salva com o endereço preenchido", async () => {
    const user = await renderStep();
    await user.type(screen.getByLabelText("Nome do negócio"), "Studio Aurora");
    await user.click(screen.getByRole("button", { name: "Outro" }));
    await user.type(
      screen.getByPlaceholderText("Qual é o seu segmento?"),
      "Beleza",
    );
    await user.click(screen.getByText("Local próprio"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Rua das Flores, 100",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        address: "Rua das Flores, 100",
        category: "Beleza",
        modalities: ["ON_SITE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    });
  });

  test("desmarcar ON_SITE depois de digitar o endereço preserva o endereço gravado (chave address ausente)", async () => {
    const user = await renderStep();
    await user.type(screen.getByLabelText("Nome do negócio"), "Studio Aurora");
    await user.click(screen.getByRole("button", { name: "Outro" }));
    await user.type(
      screen.getByPlaceholderText("Qual é o seu segmento?"),
      "Beleza",
    );
    await user.click(screen.getByText("Local próprio"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Rua das Flores, 100",
    );
    // Desmarca ON_SITE e escolhe Online no lugar.
    await user.click(screen.getByText("Local próprio"));
    await user.click(screen.getByText("Online"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(updateOnboarding).toHaveBeenCalled());
    expect(updateOnboarding).toHaveBeenCalledWith({
      business: {
        category: "Beleza",
        modalities: ["ONLINE"],
        name: "Studio Aurora",
        timezone: "America/Sao_Paulo",
      },
    });
  });
});

describe("configurações/negocio: BusinessSettings dentro de ProductSettingsScreen", () => {
  async function renderSettings(
    fixture: SettingsState = settingsFixture({ modalities: ["ONLINE"] }),
  ) {
    getSettings.mockResolvedValue(fixture);
    const user = userEvent.setup();
    render(
      <ShellConfigProvider>
        <ProductSettingsScreen scenario="business" />
      </ShellConfigProvider>,
    );
    await screen.findByLabelText("Nome do negócio");
    return user;
  }

  test("segmento oferece frequentes mais 'Outro' com texto livre", async () => {
    await renderSettings(
      settingsFixture({ category: "Cabelo", modalities: ["ONLINE"] }),
    );
    expect(screen.getByRole("button", { name: "Cabelo" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Barbearia" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Outro" })).toBeVisible();
    expect(
      screen.queryByPlaceholderText("Qual é o seu segmento?"),
    ).toBeNull();
  });

  test("sem modalidade escolhida, bloqueia o salvamento com mensagem", async () => {
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText("Escolha ao menos uma modalidade de atendimento."),
    ).toBeVisible();
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  test("ON_SITE com endereço só espaços bloqueia o salvamento com mensagem", async () => {
    // Mesmo raciocínio do onboarding: `required` já barra vazio no
    // navegador, então a prova do trim() usa um valor só de espaços.
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByText("Local próprio"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "   ",
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText("Informe o endereço do seu espaço."),
    ).toBeVisible();
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  test("ON_SITE com endereço envia o payload exato a updateBusiness e mostra confirmação", async () => {
    updateBusiness.mockResolvedValue(
      settingsFixture({
        address: "Av. Central, 456",
        modalities: ["ON_SITE"],
      }),
    );
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByText("Local próprio"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Av. Central, 456",
    );
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(updateBusiness).toHaveBeenCalledWith({
        address: "Av. Central, 456",
        category: "Beleza",
        modalities: ["ON_SITE"],
        name: "Studio Marina",
        timezone: "America/Sao_Paulo",
      }),
    );
    expect(await screen.findByText("Dados do negócio salvos.")).toBeVisible();
  });

  test("desmarcar ON_SITE depois de digitar o endereço envia updateBusiness sem a chave address", async () => {
    const user = await renderSettings(settingsFixture({ modalities: [] }));
    await user.click(screen.getByText("Local próprio"));
    await user.type(
      await screen.findByLabelText("Endereço do seu espaço"),
      "Av. Central, 456",
    );
    // Desmarca ON_SITE e escolhe Online no lugar.
    await user.click(screen.getByText("Local próprio"));
    await user.click(screen.getByText("Online"));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(updateBusiness).toHaveBeenCalled());
    expect(updateBusiness).toHaveBeenCalledWith({
      category: "Beleza",
      modalities: ["ONLINE"],
      name: "Studio Marina",
      timezone: "America/Sao_Paulo",
    });
  });

  test("aviso de projeção pendente aparece quando o servidor devolve PENDING após salvar", async () => {
    updateBusiness.mockResolvedValue(
      settingsFixture({
        contextProjectionStatus: "PENDING",
        modalities: ["ONLINE"],
      }),
    );
    const user = await renderSettings();
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(
      await screen.findByText(
        "Os dados do negócio foram salvos. A IA ainda está atualizando o contexto com essa mudança.",
      ),
    ).toBeVisible();
  });
});
