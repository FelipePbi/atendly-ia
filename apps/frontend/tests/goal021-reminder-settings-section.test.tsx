// @vitest-environment jsdom
/**
 * Goal021 (WU-010), revisto no Goal097 (AG1): bloco de Lembretes em
 * Configurações → Agenda → Lembretes. O título "Lembretes" é o da barra da
 * tela empurrada, não mais um cabeçalho do bloco.
 *
 * O que esta suíte prova:
 *
 * - o bloco lê `settings.getReminders` e reflete quantidade, antecedência
 *   (presets e personalizada), confirmação de presença e política de preço;
 * - "Ativar lembretes" nasce o primeiro lembrete no default do produto (24h);
 *   "Adicionar segundo lembrete" nasce o segundo; "Desativar lembretes" zera
 *   os dois — nunca deixa um "Lembrete 2" órfão;
 * - salvar envia exatamente o estado editado a `settings.updateReminders`,
 *   inclusive `rules: []` quando os lembretes foram desativados;
 * - erro ao carregar some silenciosamente, sem inventar estado próprio.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ReminderSettings, SettingsState } from "@/data";
import { ReminderSettingsSection } from "@/features/reminders/ReminderSettingsSection";

const getReminders = vi.fn();
const updateReminders = vi.fn();
const listServices = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    serviceCatalog: { list: listServices },
    settings: { getReminders, updateReminders },
  }),
}));

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

beforeEach(() => {
  vi.clearAllMocks();
  listServices.mockResolvedValue({ items: [] });
});

test("reflete o lembrete configurado, com o preset de 24h marcado", async () => {
  getReminders.mockResolvedValue(remindersFixture());
  render(<ReminderSettingsSection settings={settingsFixture()} />);

  expect(
    await screen.findByText("Lembrete 1 · quanto tempo antes"),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "Lembretes" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "24 h" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Adicionar segundo lembrete" }),
  ).toBeInTheDocument();
});

test("sem lembrete configurado (rules vazio): mostra 'Ativar lembretes' e nasce no default do produto", async () => {
  getReminders.mockResolvedValue(remindersFixture({ rules: [] }));
  const user = userEvent.setup();
  render(<ReminderSettingsSection settings={settingsFixture()} />);

  await user.click(
    await screen.findByRole("button", { name: "Ativar lembretes" }),
  );

  expect(screen.getByRole("button", { name: "24 h" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("adiciona e remove o segundo lembrete sem afetar o primeiro", async () => {
  getReminders.mockResolvedValue(remindersFixture());
  const user = userEvent.setup();
  render(<ReminderSettingsSection settings={settingsFixture()} />);

  await user.click(
    await screen.findByRole("button", { name: "Adicionar segundo lembrete" }),
  );
  expect(screen.getByText("Lembrete 2 · quanto tempo antes")).toBeVisible();

  await user.click(
    screen.getByRole("button", { name: "Remover segundo lembrete" }),
  );

  expect(
    screen.queryByText("Lembrete 2 · quanto tempo antes"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Lembrete 1 · quanto tempo antes")).toBeVisible();
});

test("'Desativar lembretes' zera os dois lembretes, sem deixar o segundo órfão", async () => {
  getReminders.mockResolvedValue(
    remindersFixture({
      rules: [
        { slot: "FIRST", leadMinutes: 1_440 },
        { slot: "SECOND", leadMinutes: 120 },
      ],
    }),
  );
  const user = userEvent.setup();
  render(<ReminderSettingsSection settings={settingsFixture()} />);

  await screen.findByText("Lembrete 2 · quanto tempo antes");
  await user.click(screen.getByRole("button", { name: "Desativar lembretes" }));

  expect(
    screen.queryByText("Lembrete 1 · quanto tempo antes"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Lembrete 2 · quanto tempo antes"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Ativar lembretes" }),
  ).toBeInTheDocument();
});

test("salvar envia o payload exato a updateReminders, incluindo confirmação e política de preço", async () => {
  updateReminders.mockResolvedValue(
    remindersFixture({ confirmationEnabled: true, pricePolicy: "WHEN_FIXED" }),
  );
  getReminders.mockResolvedValue(remindersFixture());
  const user = userEvent.setup();
  render(<ReminderSettingsSection settings={settingsFixture()} />);

  await screen.findByText("Lembrete 1 · quanto tempo antes");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Só quando for fixo" }));
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() =>
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: true,
      pricePolicy: "WHEN_FIXED",
      rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
    }),
  );
  expect(await screen.findByText("Lembretes salvos.")).toBeVisible();
});

test("salvar com lembretes desativados envia rules vazio explicitamente", async () => {
  updateReminders.mockResolvedValue(remindersFixture({ rules: [] }));
  getReminders.mockResolvedValue(remindersFixture());
  const user = userEvent.setup();
  render(<ReminderSettingsSection settings={settingsFixture()} />);

  await screen.findByText("Lembrete 1 · quanto tempo antes");
  await user.click(screen.getByRole("button", { name: "Desativar lembretes" }));
  await user.click(screen.getByRole("button", { name: "Salvar" }));

  await waitFor(() =>
    expect(updateReminders).toHaveBeenCalledWith({
      confirmationEnabled: false,
      pricePolicy: "NEVER",
      rules: [],
    }),
  );
});

describe("nunca inventa estado próprio", () => {
  test("erro ao carregar: some silenciosamente em vez de fabricar um estado", async () => {
    getReminders.mockRejectedValue(new Error("falhou"));
    const { container } = render(<ReminderSettingsSection settings={settingsFixture()} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
