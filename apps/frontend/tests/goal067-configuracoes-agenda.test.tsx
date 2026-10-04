// @vitest-environment jsdom
/**
 * Goal067 (WU-03): Agenda com regras de oferta e Disponibilidade por dia.
 *
 * O que esta suíte prova:
 *
 * - `OfferRulesSettings` (Goal097: as regras de oferta moram em
 *   `/configuracoes/agenda/regras`) mostra as três regras de oferta com o
 *   valor lido selecionado, inclusive `minLeadMinutes: 0` como "Sem antecedência
 *   mínima", e salvar envia as `rules` de disponibilidade lidas sem mudança
 *   junto dos campos de oferta editados;
 * - `AvailabilitySettings` mostra qualquer grade — mais de um intervalo no
 *   mesmo dia, horários diferentes entre dias — e salvar grava exatamente o
 *   que está mostrado, reenviando as regras inativas do último estado lido;
 * - sobreposição e início depois do fim são recusados inline, sem PATCH;
 * - nenhuma das duas telas mostra jargão interno de fonte/migração;
 * - `ProductSettingsScreen` ignora o abort do cleanup do efeito de
 *   carregamento (Strict Mode double-invoke): a segunda montagem do efeito
 *   ainda resolve normalmente, e a rejeição abortada da primeira não deve
 *   acender "Configurações indisponíveis".
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { SettingsState } from "@/data";
import { AvailabilitySettings } from "@/features/settings/AvailabilitySettings";
import { CalendarSettings } from "@/features/settings/CalendarSettings";
import { OfferRulesSettings } from "@/features/settings/OfferRulesSettings";
import { ProductSettingsScreen } from "@/features/settings/ProductSettingsScreen";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getSettings = vi.fn();
const getWhatsapp = vi.fn();
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
    whatsapp: { get: getWhatsapp },
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
        { active: true, dayOfWeek: 1, endTime: "12:00", id: "r1", startTime: "09:00" },
        { active: true, dayOfWeek: 1, endTime: "18:00", id: "r2", startTime: "14:00" },
        { active: true, dayOfWeek: 2, endTime: "16:00", id: "r3", startTime: "10:00" },
        { active: false, dayOfWeek: 5, endTime: "12:00", id: "r4", startTime: "09:00" },
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
      source: "AVENLY",
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
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: null,
  });
});

describe("Agenda › Antecedência e intervalos: regras de oferta", () => {
  test("as três regras aparecem com o valor lido, inclusive minLeadMinutes 0", () => {
    render(<OfferRulesSettings settings={settingsFixture()} onSaved={vi.fn()} />);

    expect(
      screen.getByRole("radio", { name: "Sem antecedência mínima" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "90 dias" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "30 min" })).toBeChecked();
  });

  test("gravar as regras de oferta envia as rules de disponibilidade lidas sem mudança", async () => {
    const settings = settingsFixture();
    updateAvailability.mockResolvedValue(settings.availability);
    const user = userEvent.setup();
    render(<OfferRulesSettings settings={settings} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: "2 h" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(updateAvailability).toHaveBeenCalledWith({
        customerChangeMinNoticeMinutes: 0,
        granularityMinutes: 30,
        maxLeadDays: 90,
        minLeadMinutes: 120,
        timezone: "America/Sao_Paulo",
        rules: [
          { active: true, dayOfWeek: 1, endTime: "12:00", startTime: "09:00" },
          { active: true, dayOfWeek: 1, endTime: "18:00", startTime: "14:00" },
          { active: true, dayOfWeek: 2, endTime: "16:00", startTime: "10:00" },
          { active: false, dayOfWeek: 5, endTime: "12:00", startTime: "09:00" },
        ],
      }),
    );
  });

  test("valor gravado fora das opções aparece selecionado como opção extra", () => {
    const settings = settingsFixture({
      availability: {
        ...settingsFixture().availability!,
        granularityMinutes: 20,
        maxLeadDays: 45,
        minLeadMinutes: 90,
      },
    });
    render(<OfferRulesSettings settings={settings} onSaved={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "90 min" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "45 dias" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "20 min" })).toBeChecked();
  });
});

describe("Disponibilidade por dia", () => {
  test("grade com dois intervalos num dia e horários diferentes entre dias é mostrada e gravada como mostrada", async () => {
    const settings = settingsFixture();
    updateAvailability.mockResolvedValue(settings.availability);
    const user = userEvent.setup();
    render(<AvailabilitySettings settings={settings} onSaved={vi.fn()} />);

    expect(
      screen.getByLabelText("Segunda · início do intervalo 1"),
    ).toHaveValue("09:00");
    expect(screen.getByLabelText("Segunda · fim do intervalo 1")).toHaveValue(
      "12:00",
    );
    expect(
      screen.getByLabelText("Segunda · início do intervalo 2"),
    ).toHaveValue("14:00");
    expect(screen.getByLabelText("Segunda · fim do intervalo 2")).toHaveValue(
      "18:00",
    );
    expect(screen.getByLabelText("Terça · início do intervalo 1")).toHaveValue(
      "10:00",
    );
    expect(screen.getByLabelText("Terça · fim do intervalo 1")).toHaveValue(
      "16:00",
    );

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(updateAvailability).toHaveBeenCalledWith({
        timezone: "America/Sao_Paulo",
        rules: [
          { active: true, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
          { active: true, dayOfWeek: 1, startTime: "14:00", endTime: "18:00" },
          { active: true, dayOfWeek: 2, startTime: "10:00", endTime: "16:00" },
          { active: false, dayOfWeek: 5, startTime: "09:00", endTime: "12:00" },
        ],
      }),
    );
  });

  test("início depois do fim é recusado inline, sem PATCH", async () => {
    const settings = settingsFixture();
    const user = userEvent.setup();
    render(<AvailabilitySettings settings={settings} onSaved={vi.fn()} />);

    const mondayStart1 = screen.getByLabelText("Segunda · início do intervalo 1");
    await user.clear(mondayStart1);
    await user.type(mondayStart1, "13:00");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(updateAvailability).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "O horário final deve ser depois do horário inicial.",
    );
  });

  test("intervalos sobrepostos no mesmo dia são recusados inline, sem PATCH", async () => {
    const settings = settingsFixture({
      availability: {
        customerChangeMinNoticeMinutes: 0,
        granularityMinutes: 30,
        maxLeadDays: 90,
        minLeadMinutes: 0,
        rules: [
          { active: true, dayOfWeek: 1, endTime: "12:00", id: "r1", startTime: "09:00" },
          { active: true, dayOfWeek: 1, endTime: "18:00", id: "r2", startTime: "11:00" },
        ],
        timezone: "America/Sao_Paulo",
      },
    });
    const user = userEvent.setup();
    render(<AvailabilitySettings settings={settings} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(updateAvailability).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Os intervalos não podem se sobrepor.",
    );
  });
});

describe("sem jargão interno de fonte/migração", () => {
  test("CalendarSettings, OfferRulesSettings e AvailabilitySettings não mostram 'Fonte oficial' nem 'migração assistida'", () => {
    const settings = settingsFixture();
    const { container: calendarContainer } = render(
      <CalendarSettings settings={settings} />,
    );
    expect(calendarContainer).not.toHaveTextContent("Fonte oficial");
    expect(calendarContainer).not.toHaveTextContent("migração assistida");

    const { container: rulesContainer } = render(
      <OfferRulesSettings settings={settings} onSaved={vi.fn()} />,
    );
    expect(rulesContainer).not.toHaveTextContent("Fonte oficial");
    expect(rulesContainer).not.toHaveTextContent("migração assistida");

    const { container: availabilityContainer } = render(
      <AvailabilitySettings settings={settings} onSaved={vi.fn()} />,
    );
    expect(availabilityContainer).not.toHaveTextContent("Fonte oficial");
    expect(availabilityContainer).not.toHaveTextContent("migração assistida");
  });
});

describe("ProductSettingsScreen ignora o abort do cleanup", () => {
  test("com abort no cleanup, não mostra 'Configurações indisponíveis'", async () => {
    let callCount = 0;
    getSettings.mockImplementation((signal?: AbortSignal) => {
      callCount += 1;
      if (callCount === 1) {
        // Primeira montagem do efeito (Strict Mode): nunca resolve por si só,
        // só rejeita quando o cleanup aborta o sinal — como um fetch real.
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }
      return Promise.resolve(settingsFixture());
    });
    getWhatsapp.mockResolvedValue(null);

    render(
      <StrictMode>
        <ShellConfigProvider>
          <ProductSettingsScreen scenario="calendar" />
        </ShellConfigProvider>
      </StrictMode>,
    );

    await screen.findByRole("heading", { level: 1, name: "Agenda" });
    expect(
      screen.queryByText("Configurações indisponíveis"),
    ).not.toBeInTheDocument();
  });
});
