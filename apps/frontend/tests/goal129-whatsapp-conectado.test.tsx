// @vitest-environment jsdom
/**
 * Goal129 (WU-01) — o WhatsApp conectado do onboarding igual ao quadro 4.4.
 *
 * O painel de conexão e a tela do onboarding são os reais; só o runtime de
 * serviços é trocado.
 *
 * 1. Com `GET /v1/whatsapp` CONNECTED, `/onboarding/whatsapp-conectar` mostra o
 *    corpo do quadro: telefone formatado, pílula "Conectado", "WhatsApp
 *    conectado" e a pergunta do quadro. Sem CONNECTED, nada disso aparece e a
 *    fase de consentimento é a de hoje.
 * 2. "Sim, continuar" faz o que "Continuar" fazia (confere a conexão e vai para
 *    contatos-ignorados). "Conectei o número errado" abre a folha de
 *    desconexão de hoje e nada desconecta sem confirmar.
 * 3. Configurações › WhatsApp (W1) continua com a identidade dele.
 * 4. Com prefers-reduced-motion: reduce, nenhuma animação do corpo roda.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { OnboardingState, SettingsState } from "@/data";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
}));

const getOnboarding = vi.fn();
const getWhatsapp = vi.fn();
const disconnectWhatsapp = vi.fn();
const logout = vi.fn();
const refreshSession = vi.fn();
const setUnauthenticated = vi.fn();
const listConversations = vi.fn();
const listIgnoredContacts = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    auth: { logout },
    conversations: { list: listConversations, listIgnoredContacts },
    onboarding: { complete: vi.fn(), get: getOnboarding, update: vi.fn() },
    whatsapp: {
      connect: vi.fn(),
      disconnect: disconnectWhatsapp,
      get: getWhatsapp,
      qr: vi.fn(),
      reconnect: vi.fn(),
    },
  }),
  useProductRuntime: () => ({ refreshSession, setUnauthenticated }),
}));

import { OnboardingRuntimeProvider } from "@/features/onboarding/OnboardingRuntime";
import { OnboardingScreen } from "@/features/onboarding/OnboardingScreen";
import { WhatsAppSettings } from "@/features/settings/WhatsAppSettings";

const CONNECTED = {
  connectedAt: "2026-09-18T15:00:00.000Z",
  id: "wa-1",
  phoneNumber: "5511987654321",
  status: "CONNECTED" as const,
  updatedAt: "2026-10-01T15:00:00.000Z",
};

function onboardingState(): OnboardingState {
  return {
    ai: { tone: "PROFESSIONAL" },
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
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
    completed: false,
    completedAt: null,
    service: null,
    whatsapp: null,
  };
}

function settingsFixture(): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [],
      timezone: "America/Sao_Paulo",
    },
    business: null,
    calendar: {
      capabilities: {
        createAppointments: true,
        manageAvailability: true,
        manageCustomers: true,
        manageServices: true,
        migrate: true,
      },
      integration: null,
      source: "AVENLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getWhatsapp.mockResolvedValue(CONNECTED);
  getOnboarding.mockResolvedValue(onboardingState());
  refreshSession.mockResolvedValue(null);
  listConversations.mockResolvedValue({ conversations: [], nextCursor: null });
  listIgnoredContacts.mockResolvedValue({ items: [], total: 0 });
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
      ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      }) as MediaQueryList;
  }
});

function renderConnectStep() {
  return render(
    <OnboardingRuntimeProvider>
      <OnboardingScreen scenario="whatsapp-conectar" />
    </OnboardingRuntimeProvider>,
  );
}

describe("4.4: o número conectado do onboarding", () => {
  test("com CONNECTED, mostra o telefone formatado, a pílula, o título e a pergunta do quadro", async () => {
    renderConnectStep();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "WhatsApp conectado",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "É este o número que seus clientes usam para falar com você?",
      ),
    ).toBeVisible();
    expect(screen.getByText("+55 11 98765-4321")).toBeVisible();
    expect(screen.getByText("Conectado")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sim, continuar" }),
    ).toHaveClass("btn-primary");
    expect(
      screen.getByRole("button", { name: "Conectei o número errado" }),
    ).toBeVisible();

    // O corpo de antes (cartão da Configurações) não existe aqui.
    expect(
      screen.queryByRole("button", { name: "Desconectar número" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("O atendimento automático pode operar neste número."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // O espaço do chevron fica vazio: não há "Voltar".
    expect(
      screen.queryByRole("link", { name: "Voltar" }),
    ).not.toBeInTheDocument();
  });

  test("sem número conectado, a fase de consentimento é a de hoje e nada do quadro aparece", async () => {
    getWhatsapp.mockResolvedValue(null);
    renderConnectStep();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Antes de conectar" }),
    ).toBeVisible();
    expect(await screen.findByRole("checkbox")).toBeVisible();
    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(screen.queryByText("WhatsApp conectado")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sim, continuar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Conectei o número errado" }),
    ).not.toBeInTheDocument();
  });

  test("com a leitura em outro estado que não CONNECTED, a pílula 'Conectado' não aparece", async () => {
    getWhatsapp.mockResolvedValue({ ...CONNECTED, status: "WAITING_QR" });
    renderConnectStep();

    // Espera a leitura assentar: sem isso, as asserções abaixo valeriam sobre a
    // tela de carregamento e passariam mesmo com a pílula mostrada.
    await waitFor(() => expect(getWhatsapp).toHaveBeenCalled());
    expect(await screen.findByRole("checkbox")).toBeVisible();
    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(screen.queryByText("WhatsApp conectado")).not.toBeInTheDocument();
    expect(screen.queryByText("+55 11 98765-4321")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sim, continuar" }),
    ).not.toBeInTheDocument();
  });

  test("'Sim, continuar' confere a conexão e vai para contatos-ignorados", async () => {
    const user = userEvent.setup();
    renderConnectStep();

    await user.click(
      await screen.findByRole("button", { name: "Sim, continuar" }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/onboarding/contatos-ignorados"),
    );
    expect(getWhatsapp.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("'Sim, continuar' não avança se a leitura já não diz CONNECTED", async () => {
    const user = userEvent.setup();
    renderConnectStep();
    const cta = await screen.findByRole("button", { name: "Sim, continuar" });

    getWhatsapp.mockResolvedValue(null);
    await user.click(cta);

    expect(
      await screen.findByText(
        "Conclua a vinculação no WhatsApp antes de continuar.",
      ),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  test("'Conectei o número errado' abre a folha de hoje e nada desconecta sem confirmar", async () => {
    const user = userEvent.setup();
    renderConnectStep();

    await user.click(
      await screen.findByRole("button", { name: "Conectei o número errado" }),
    );

    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByRole("heading", { name: "Desconectar o WhatsApp?" }),
    ).toBeVisible();
    expect(within(sheet).getByText(/O número \+55 11 98765-4321/)).toBeVisible();
    expect(disconnectWhatsapp).not.toHaveBeenCalled();

    await user.click(
      within(sheet).getByRole("button", { name: "Manter conectado" }),
    );
    expect(disconnectWhatsapp).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("+55 11 98765-4321")).toBeVisible();
  });

  test("confirmar a desconexão chama disconnect uma vez e volta ao consentimento", async () => {
    disconnectWhatsapp.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderConnectStep();

    await user.click(
      await screen.findByRole("button", { name: "Conectei o número errado" }),
    );
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Desconectar" }));

    expect(disconnectWhatsapp).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Antes de conectar" }),
    ).toBeVisible();
    expect(screen.queryByText("Conectado")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sim, continuar" }),
    ).not.toBeInTheDocument();
  });

  test("falha ao desconectar mantém o número e mostra o alerta na tela", async () => {
    disconnectWhatsapp.mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderConnectStep();

    await user.click(
      await screen.findByRole("button", { name: "Conectei o número errado" }),
    );
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Desconectar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível desconectar o número.",
    );
    expect(screen.getByText("+55 11 98765-4321")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Sim, continuar" }),
    ).toBeVisible();
  });
});

describe("Configurações › WhatsApp (W1) segue com a identidade dele", () => {
  test("conectado, mostra as linhas de hoje e nenhum corpo do onboarding", async () => {
    render(
      <WhatsAppSettings
        onStatusChange={() => {}}
        settings={settingsFixture()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /^Desconectar WhatsApp/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^Trocar número/ }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Sim, continuar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Conectei o número errado" }),
    ).not.toBeInTheDocument();
  });
});

describe("movimento do corpo conectado", () => {
  test("com prefers-reduced-motion: reduce, o disco e o texto param", () => {
    const css = readFileSync(
      resolve(__dirname, "../src/shared/styles/avenly.css"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    const blocks = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\{[^}]*\}[^}]*\}/g,
    );
    const block = (blocks ?? []).find((candidate) =>
      candidate.includes(".whatsapp-connected-identity"),
    );
    expect(block).toBeDefined();
    expect(block).toContain(".onboarding-content.is-connected .onboarding-heading");
    expect(block).toMatch(/animation:\s*none/);
  });
});
