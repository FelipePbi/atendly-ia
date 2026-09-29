// @vitest-environment jsdom
/**
 * Goal069 (WU-04): "Como você vê a Agenda" nunca deixa ocultar os sete dias
 * (observação 4 do review073). Com seis já ocultos, o sétimo (o único
 * visível) fica desabilitado e mostra o motivo. Se o servidor recusar pelo
 * mesmo motivo — sete dias em `hiddenWeekdays`, `agendaHiddenWeekdaysSchema`
 * em `apps/bff/src/modules/settings/routes.ts` — a mensagem do painel é a
 * mesma frase, não a genérica de falha.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BffHttpError, type SettingsState } from "@/data";
import { CalendarSettings } from "@/features/settings/CalendarSettings";

const REASON = "Pelo menos um dia precisa aparecer na Agenda.";

const getSettings = vi.fn();
const getReminders = vi.fn();
const updateAvailability = vi.fn();
const getAgendaViewPreference = vi.fn();
const updateAgendaViewPreference = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    settings: {
      get: getSettings,
      getAgendaViewPreference,
      getReminders,
      updateAgendaViewPreference,
      updateAvailability,
    },
  }),
}));

function settingsFixture(overrides: Partial<SettingsState> = {}): SettingsState {
  return {
    ai: { enabled: true, tone: "BALANCED" },
    availability: {
      customerChangeMinNoticeMinutes: 0,
      granularityMinutes: 30,
      maxLeadDays: 90,
      minLeadMinutes: 0,
      rules: [
        { active: true, dayOfWeek: 1, endTime: "18:00", id: "r1", startTime: "09:00" },
      ],
      timezone: "America/Sao_Paulo",
    },
    business: {
      address: null,
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getReminders.mockResolvedValue({
    configured: false,
    confirmationEnabled: false,
    pricePolicy: "NEVER",
    rules: [{ slot: "FIRST", leadMinutes: 1_440 }],
  });
  // Segunda…Sábado ocultos; só Domingo continua visível.
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [1, 2, 3, 4, 5, 6],
    initialView: null,
  });
});

describe("Seis dias ocultos: o sétimo não pode ocultar", () => {
  test("o único dia visível fica desabilitado e o motivo aparece", async () => {
    render(<CalendarSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    const sunday = await screen.findByRole("button", { name: "Domingo" });
    expect(sunday).toBeDisabled();
    expect(screen.getByText(REASON)).toBeVisible();
  });

  test("clicar no dia desabilitado não muda a seleção nem chama o servidor", async () => {
    const user = userEvent.setup();
    render(<CalendarSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    const sunday = await screen.findByRole("button", { name: "Domingo" });
    await user.click(sunday);

    expect(sunday).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Salvar visualização" }));
    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledWith({
        hiddenWeekdays: [1, 2, 3, 4, 5, 6],
        initialView: null,
      }),
    );
  });

  test("dias já ocultos continuam clicáveis para reaparecer", async () => {
    const user = userEvent.setup();
    updateAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [2, 3, 4, 5, 6],
      initialView: null,
    });
    render(<CalendarSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    const monday = await screen.findByRole("button", { name: "Segunda" });
    expect(monday).not.toBeDisabled();
    await user.click(monday);
    await user.click(screen.getByRole("button", { name: "Salvar visualização" }));

    await waitFor(() =>
      expect(updateAgendaViewPreference).toHaveBeenCalledWith({
        hiddenWeekdays: [2, 3, 4, 5, 6],
        initialView: null,
      }),
    );
  });
});

describe("Recusa do servidor pelo mesmo motivo", () => {
  test("mostra a mesma frase, não a genérica", async () => {
    updateAgendaViewPreference.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        details: { fieldErrors: { hiddenWeekdays: ["Array must contain at most 6 element(s)"] } },
        message: "Invalid request body.",
        requestId: "req-1",
        status: 400,
      }),
    );
    const user = userEvent.setup();
    render(<CalendarSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    await screen.findByRole("button", { name: "Domingo" });
    const saveButton = screen.getByRole("button", { name: "Salvar visualização" });
    await user.click(saveButton);

    const status = saveButton
      .closest(".settings-form-actions")!
      .querySelector('[role="status"]') as HTMLElement;
    await waitFor(() => expect(status).toHaveTextContent(REASON));
    expect(status).not.toHaveTextContent(
      "Não foi possível salvar as preferências da Agenda.",
    );
  });

  test("outra falha do servidor continua com a mensagem genérica", async () => {
    updateAgendaViewPreference.mockRejectedValue(new Error("falha de rede"));
    const user = userEvent.setup();
    render(<CalendarSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    await screen.findByRole("button", { name: "Domingo" });
    await user.click(screen.getByRole("button", { name: "Salvar visualização" }));

    await waitFor(() =>
      expect(
        screen.getByText("Não foi possível salvar as preferências da Agenda."),
      ).toBeVisible(),
    );
  });
});
