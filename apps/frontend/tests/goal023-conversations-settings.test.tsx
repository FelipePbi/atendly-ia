// @vitest-environment jsdom
/**
 * Goal023 (§8, critério 42), revisto no Goal097 (M1): a retenção é a seção **Conversas** de
 * Configurações, e não um bloco escondido dentro de Conta.
 *
 * O que esta suíte prova pelo que a usuária encontra:
 *
 * - o hub tem um card "Conversas" navegável para `/configuracoes/conversas`;
 * - a página desse cenário é a de retenção, com o cabeçalho de Conversas;
 * - Conta não hospeda mais o prazo de retenção — o card que se descreve como
 *   "Senha e acesso" não é onde se apaga mensagem de cliente.
 *
 * A tela não foi redecomposta: `ProductSettingsScreen` continua inteira, com
 * uma seção a mais, no mesmo padrão das vigentes (a redecomposição é do 024).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

import type { RetentionSettings, SettingsState } from "@/data";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import type * as SystemStatusModule from "@/shared/runtime/systemStatus";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getSettings = vi.fn();
const getRetention = vi.fn();
const updateRetention = vi.fn();
const getWhatsapp = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    account: { requestDeletion: vi.fn(), cancelDeletion: vi.fn() },
    auth: { changePassword: vi.fn(), logout: vi.fn() },
    migration: {
      getImportState: vi.fn().mockResolvedValue({ history: null, session: null }),
    },
    retention: { get: getRetention, update: updateRetention },
    serviceCatalog: { list: vi.fn().mockResolvedValue({ items: [] }) },
    settings: { get: getSettings },
    whatsapp: { get: getWhatsapp },
  }),
  useProductRuntime: () => ({
    refreshSession: vi.fn(),
    session: { user: { email: "marina@studio.com" } },
    setUnauthenticated: vi.fn(),
  }),
}));

// `AccountSettings` lê `accountDeletion` de `useSystemStatus` (Goal025/WU-08);
// esta suíte é sobre Conversas hospedar a retenção, não sobre o ciclo de vida
// da conta, e não monta `SystemStatusProvider`. O hub também lê o estado da IA
// e do WhatsApp para as próprias linhas (M1).
vi.mock("@/shared/runtime/systemStatus", async (importOriginal) => {
  const actual = await importOriginal<typeof SystemStatusModule>();
  return {
    ...actual,
    useSystemStatus: () => ({
      accountDeletion: { status: "NONE", dueAt: null },
      ai: null,
      aiView: "off",
      phase: "loaded",
      refresh: vi.fn(),
      whatsapp: null,
      whatsappView: "off",
    }),
  };
});

function settingsFixture(): SettingsState {
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

function retentionFixture(): RetentionSettings {
  return {
    commercialRetentionDays: 90,
    personalRetentionDays: 30,
    retentionDaysOptions: [30, 90, 180, 365],
    unclassifiedRetentionFollows: "COMMERCIAL",
    lastSweepCompletedAt: null,
    appliesFrom: "NEXT_SWEEP",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue(settingsFixture());
  getRetention.mockResolvedValue(retentionFixture());
  getWhatsapp.mockResolvedValue(null);
});

function renderScenario(scenario: "hub" | "conversations" | "account") {
  render(
    <ShellConfigProvider>
      <ProductSettingsScreen scenario={scenario} />
    </ShellConfigProvider>,
  );
}

test("o hub oferece Conversas como entrada navegável própria", async () => {
  renderScenario("hub");

  const card = await screen.findByRole("link", { name: /Conversas/ });
  expect(card).toHaveAttribute("href", "/configuracoes/conversas");
});

test("a página de Conversas é a da retenção, com os dois seletores", async () => {
  renderScenario("conversations");

  expect(
    await screen.findByRole("heading", { level: 1, name: "Conversas" }),
  ).toBeVisible();
  const commercial = await screen.findByRole("radiogroup", {
    name: "Conversas comerciais",
  });
  expect(within(commercial).getByRole("radio", { name: "90 dias" })).toBeChecked();
  const personal = screen.getByRole("radiogroup", { name: "Conversas pessoais" });
  expect(within(personal).getByRole("radio", { name: "30 dias" })).toBeChecked();
});

test("Conta não hospeda mais o prazo de retenção", async () => {
  renderScenario("account");

  await screen.findByRole("heading", { level: 1, name: "Conta" });
  await waitFor(() => expect(getRetention).not.toHaveBeenCalled());
  expect(
    screen.queryByRole("radiogroup", { name: "Conversas comerciais" }),
  ).not.toBeInTheDocument();
});
