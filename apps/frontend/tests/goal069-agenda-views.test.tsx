// @vitest-environment jsdom
/**
 * Goal069 §2 (WU-02): faixa da semana no Dia com pontos, dia vazio com
 * motivo, bloco da Semana com nome e serviço, troca de visualização
 * preservando o dia focado e "Próximo agendamento" relativo a agora em Dia,
 * Semana e Mês.
 *
 * Cada teste roda primeiro contra a baseline `37c7371` (colado no relatório
 * como vermelho) e depois contra o código deste Goal.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type CalendarState,
  type SettingsState,
  type TimeBlock,
} from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { WeekView } from "@/features/agenda/WeekView";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
    settings: {
      get: getSettings,
      getAgendaViewPreference,
    },
  }),
}));

function calendarFixture(overrides: Partial<CalendarState> = {}): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "ATENDLY",
    timezone: "America/Sao_Paulo",
    ...overrides,
  };
}

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
    calendar: calendarFixture(),
    ...overrides,
  };
}

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "5511998887766" },
    customerId: "c1",
    date: "2026-09-28",
    durationMinutes: 60,
    endTime: "11:00",
    finalValue: null,
    id: "apt-1",
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 60,
        name: "Corte feminino",
        price: 90,
        priceType: "FIXED",
        serviceId: "s1",
      },
    ],
    source: "USER",
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

function timeBlockFixture(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    endAt: "2026-09-28T16:00:00.000Z",
    id: "block-1",
    kind: "BLOCK",
    reason: null,
    seriesId: null,
    startAt: "2026-09-28T15:00:00.000Z",
    title: "Almoço",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 390;
  // Terça, 29/09/2026 — a semana da faixa e da janela lida vai de segunda
  // (28/09) a domingo (04/10/2026), como o §6.6 do Goal069 descreve.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  getCalendar.mockResolvedValue(calendarFixture());
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  listAppointments.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: null,
  });
  getSettings.mockResolvedValue(settingsFixture());
});

afterEach(() => {
  vi.useRealTimers();
});

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

describe("§6.3 — faixa da semana no Dia, com pontos (AG-01)", () => {
  test("mostra os sete dias da semana e ponto só nos dias com agendamento ativo", async () => {
    listAppointments.mockResolvedValue([
      appointmentFixture({ date: "2026-09-28", id: "apt-active", status: "CONFIRMED" }),
      appointmentFixture({ date: "2026-09-30", id: "apt-cancelled", status: "CANCELLED" }),
    ]);
    renderBoard();

    const strip = await screen.findByRole("group", { name: "Dias da semana" });
    const days = within(strip).getAllByRole("button");
    expect(days).toHaveLength(7);

    const monday = within(strip).getByText("28").closest("button")!;
    expect(monday.querySelector(".agenda-week-strip-dot")).not.toBeNull();

    const wednesday = within(strip).getByText("30").closest("button")!;
    expect(wednesday.querySelector(".agenda-week-strip-dot")).toBeNull();
  });

  test("tocar num dia foca esse dia", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderBoard();

    const strip = await screen.findByRole("group", { name: "Dias da semana" });
    const wednesday = within(strip).getByText("30").closest("button")!;
    await user.click(wednesday);

    expect(
      await screen.findByRole("region", { name: /30 de setembro de 2026/i }),
    ).toBeInTheDocument();
  });
});

describe("§6.4 — dia vazio com motivo e ação (AG-03)", () => {
  test("sem regra de disponibilidade mostra o motivo e, com a capacidade, 'Criar agendamento'", async () => {
    // Terça (dayOfWeek 2) sem regra ativa: só segunda (dayOfWeek 1) atende.
    getSettings.mockResolvedValue(
      settingsFixture({
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
      }),
    );
    renderBoard();

    expect(
      await screen.findByText("Você não atende neste dia."),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Criar agendamento" }),
    ).toBeVisible();
  });

  test("com a leitura de disponibilidade falhando, o motivo não aparece", async () => {
    getSettings.mockRejectedValue(new Error("falha de rede"));
    renderBoard();

    await screen.findByText("Nenhum atendimento neste dia.");
    expect(screen.queryByText("Você não atende neste dia.")).toBeNull();
  });
});

describe("§6.5 — bloco da Semana com nome e serviço (AG-04)", () => {
  test("o nome do cliente e o serviço aparecem no texto e no nome acessível", () => {
    const appointment = appointmentFixture();
    render(
      <WeekView
        entries={[
          {
            appointment,
            date: "2026-09-28",
            endMinutes: 660,
            key: appointment.id,
            kind: "appointment",
            startMinutes: 600,
          },
        ]}
        onSelectDay={vi.fn()}
        start="2026-09-28"
      />,
    );

    const block = screen.getByLabelText(/Ana Paula/);
    expect(block).toHaveAccessibleName(/Ana Paula/);
    expect(block).toHaveAccessibleName(/Corte feminino/);
    expect(within(block).getByText("Ana Paula")).toBeVisible();
    expect(within(block).getByText(/Corte feminino/)).toBeVisible();
  });

  test("um bloqueio e um compromisso pessoal com o mesmo título têm nome acessível distinto (regressão)", () => {
    const block = timeBlockFixture({ id: "block-1", kind: "BLOCK", title: "Almoço" });
    const personal = timeBlockFixture({
      id: "block-2",
      kind: "PERSONAL",
      startAt: "2026-09-28T17:00:00.000Z",
      endAt: "2026-09-28T18:00:00.000Z",
      title: "Almoço",
    });
    render(
      <WeekView
        entries={[
          {
            date: "2026-09-28",
            endMinutes: 780,
            key: block.id,
            kind: "block",
            startMinutes: 720,
            timeBlock: block,
          },
          {
            date: "2026-09-28",
            endMinutes: 900,
            key: personal.id,
            kind: "personal",
            startMinutes: 840,
            timeBlock: personal,
          },
        ]}
        onSelectDay={vi.fn()}
        start="2026-09-28"
      />,
    );

    const blockBar = screen.getByLabelText(/^Bloqueio: /);
    const personalBar = screen.getByLabelText(/^Compromisso pessoal: /);
    expect(blockBar).toHaveAccessibleName(/^Bloqueio: Almoço/);
    expect(personalBar).toHaveAccessibleName(/^Compromisso pessoal: Almoço/);
    expect(blockBar.getAttribute("aria-label")).not.toBe(
      personalBar.getAttribute("aria-label"),
    );
  });
});

describe("§6.6 — troca de visualização preserva o dia focado (AG-05)", () => {
  test("hoje domingo 27/09/2026, 'Próxima semana' e depois Mês abrem setembro, não outubro", async () => {
    window.innerWidth = 1200;
    vi.setSystemTime(new Date(2026, 8, 27, 12, 0, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderBoard();

    await screen.findByRole("tab", { name: "Semana" });
    // Semana exibida vai de segunda 28/09 a domingo 04/10/2026 — maioria em
    // setembro. `goToAdjacent` somava os 7 dias ao cursor bruto (domingo
    // 27/09 → domingo 04/10), e o Mês então abria a partir do cursor, em
    // outubro, mesmo com a semana à vista majoritariamente em setembro.
    await user.click(screen.getByRole("button", { name: "Próxima semana" }));

    await user.click(screen.getByRole("tab", { name: "Mês" }));

    // Goal092: a barra mostra mês e ano ("Setembro 2026"), não mais a data
    // longa por visualização.
    await vi.waitFor(() =>
      expect(document.querySelector(".agenda-date-title")).toHaveTextContent(
        "Setembro 2026",
      ),
    );
    expect(document.querySelector(".agenda-date-title")).not.toHaveTextContent(
      "Outubro",
    );
  });
});

describe("§6.7 — sem 'Próximo agendamento' na Agenda (AG-06, revisto no Goal092)", () => {
  test("o cartão não aparece em Dia, Semana nem Mês, mesmo com agendamento futuro, e a Agenda não lê além da janela da visualização", async () => {
    const past = appointmentFixture({
      date: "2026-09-29",
      id: "apt-passado",
      startTime: "10:00",
      status: "CONFIRMED",
    });
    const future = appointmentFixture({
      customer: { id: "c2", name: "Cliente Futuro", phone: "5511977776666" },
      date: "2026-10-10",
      id: "apt-futuro",
      startTime: "09:00",
      status: "CONFIRMED",
    });
    listAppointments.mockImplementation(
      (query: { endDate: string; startDate: string }) => {
        return Promise.resolve(
          [past, future].filter(
            (item) => item.date >= query.startDate && item.date <= query.endDate,
          ),
        );
      },
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderBoard();

    await screen.findByText("Ana Paula");
    expect(screen.queryByText(/Próximo agendamento/)).toBeNull();
    expect(screen.queryByText("Cliente Futuro")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Semana" }));
    await screen.findByRole("region", { name: "Mapa da semana" });
    expect(screen.queryByText(/Próximo agendamento/)).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Mês" }));
    await screen.findByRole("region", { name: "Mapa do mês" });
    expect(screen.queryByText(/Próximo agendamento/)).toBeNull();

    // A leitura própria de 60 dias saiu: nenhuma janela lida passa de uma
    // grade de mês (6 semanas = 42 dias).
    const dayMs = 24 * 60 * 60 * 1000;
    for (const [query] of listAppointments.mock.calls as Array<
      [{ endDate: string; startDate: string }]
    >) {
      const span =
        (Date.parse(query.endDate) - Date.parse(query.startDate)) / dayMs;
      expect(span).toBeLessThanOrEqual(42);
    }
  });
});
