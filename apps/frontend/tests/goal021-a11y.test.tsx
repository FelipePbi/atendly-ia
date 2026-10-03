// @vitest-environment jsdom
/**
 * Goal021 (WU-010), revisto no Goal097 (AG1): prova de acessibilidade do
 * bloco de Lembretes, hoje a tela `/configuracoes/agenda/lembretes`, no mesmo padrão de `goal018-a11y.test.tsx` e
 * `goal020-a11y.test.tsx` para os módulos anteriores. Cobre o estado com um
 * lembrete, com dois lembretes e sem lembrete configurado (CTA "Ativar
 * lembretes"). O que esta suíte não prova: layout real, largura de viewport,
 * contraste computado — isso é `npm run validate:ui`, não jsdom.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, test, vi } from "vitest";

import type { ReminderSettings, SettingsState } from "@/data";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getSettings = vi.fn();
const getWhatsapp = vi.fn();
const getImportState = vi.fn();
const getReminders = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: { getImportState },
    settings: {
      get: getSettings,
      getAgendaViewPreference: vi.fn().mockResolvedValue({
        hiddenWeekdays: [],
        initialView: null,
      }),
      getReminders,
    },
    whatsapp: { get: getWhatsapp },
  }),
}));

function settingsFixture(): SettingsState {
  return {
    ai: { enabled: false, tone: null },
    availability: null,
    business: null,
    calendar: {
      capabilities: {
        createAppointments: false,
        manageAvailability: false,
        manageCustomers: false,
        manageServices: false,
        migrate: false,
      },
      integration: null,
      source: "ATENDLY",
      timezone: "America/Sao_Paulo",
    },
  };
}

function remindersFixture(
  overrides: Partial<ReminderSettings> = {},
): ReminderSettings {
  return {
    configured: true,
    confirmationEnabled: false,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue(settingsFixture());
  getWhatsapp.mockResolvedValue(null);
  getImportState.mockResolvedValue({
    history: null,
    right: { available: false, completedAt: null, sessionId: null },
    session: null,
  });
});

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <ProductSettingsScreen scenario="calendar-reminders" />
    </ShellConfigProvider>,
  );
}

test("um lembrete configurado, confirmação desligada", async () => {
  getReminders.mockResolvedValue(remindersFixture());
  const { container } = renderScreen();

  await screen.findByText("Lembrete 1 · quanto tempo antes");
  await expectNoA11yViolations(container);
});

test("dois lembretes configurados, confirmação ligada e preço fixo", async () => {
  getReminders.mockResolvedValue(
    remindersFixture({
      confirmationEnabled: true,
      pricePolicy: "WHEN_FIXED",
      rules: [
        { slot: "FIRST", leadMinutes: 2_880 },
        { slot: "SECOND", leadMinutes: 120 },
      ],
    }),
  );
  const { container } = renderScreen();

  await screen.findByText("Lembrete 2 · quanto tempo antes");
  await expectNoA11yViolations(container);
});

test("sem lembrete configurado: só o CTA 'Ativar lembretes'", async () => {
  getReminders.mockResolvedValue(remindersFixture({ rules: [] }));
  const { container } = renderScreen();

  await screen.findByRole("button", { name: "Ativar lembretes" });
  await expectNoA11yViolations(container);
});
