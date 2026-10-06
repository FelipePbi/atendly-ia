// @vitest-environment jsdom
/**
 * Goal021 (WU-010), revisto no Goal097 (AG1): fecha a mesma invariante que goal016/goal017/goal018/
 * goal019/goal020 fecharam para os módulos anteriores — `ShellConfigProvider`
 * mais a árvore real de Configurações → Agenda → Lembretes precisa sobreviver a
 * montagem e interação repetida no bloco de Lembretes sem violar a regra de
 * uma chamada de `useShellConfig` por árvore. `ProductSettingsScreen` é o
 * único ponto que chama o hook; `ReminderSettingsSection` (como
 * `ImportSettingsSection` antes dela) nunca chama. Se essa invariante for
 * violada, React lança "Maximum update depth exceeded" e a interação abaixo
 * lança essa mesma exceção, derrubando o teste.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ReminderSettings, SettingsState } from "@/data";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getSettings = vi.fn();
const getWhatsapp = vi.fn();
const getImportState = vi.fn();
const getReminders = vi.fn();
const updateReminders = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    migration: { getImportState },
    serviceCatalog: { list: vi.fn().mockResolvedValue({ items: [] }) },
    settings: {
      get: getSettings,
      getAgendaViewPreference: vi.fn().mockResolvedValue({
        hiddenWeekdays: [],
        initialView: null,
      }),
      getReminders,
      updateReminders,
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
      source: "AVENLY",
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

function renderScreen() {
  return render(
    <ShellConfigProvider>
      <ProductSettingsScreen scenario="calendar-reminders" />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getWhatsapp.mockResolvedValue(null);
  getImportState.mockResolvedValue({
    history: null,
    right: { available: false, completedAt: null, sessionId: null },
    session: null,
  });
});

describe("ShellConfigProvider + bloco de Lembretes não excede a profundidade de atualização", () => {
  test("alterna presets, adiciona/remove o segundo lembrete e alterna a confirmação repetidamente", async () => {
    getSettings.mockResolvedValue(settingsFixture());
    getReminders.mockResolvedValue(remindersFixture());
    const user = userEvent.setup();

    renderScreen();

    await screen.findByText("Lembrete 1 · quanto tempo antes");
    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: "12 h" }));
      await user.click(screen.getByRole("button", { name: "2 h" }));
      await user.click(screen.getByRole("checkbox"));
      await user.click(
        screen.getByRole("button", { name: "Adicionar segundo lembrete" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Remover segundo lembrete" }),
      );
    }

    expect(
      screen.getByRole("heading", { level: 1, name: "Lembretes" }),
    ).toBeInTheDocument();
    expect(updateReminders).not.toHaveBeenCalled();
  });
});
