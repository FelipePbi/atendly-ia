// @vitest-environment jsdom
/**
 * Goal073 (WU-05): AgendaBoard lê a preferência de agenda-view e decide a
 * visualização inicial e os dias visíveis de Semana/Mês a partir dela.
 * Automática (sem preferência gravada, ou leitura falhada) segue a regra
 * mobile-first do produto: Semana a partir de 1024px, Dia abaixo. Uma
 * visualização gravada (DAY/WEEK/MONTH) vale em qualquer largura. Dias
 * ocultos somem de Semana e Mês, mas nunca do Dia, que continua navegando
 * por todos eles.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listTimeBlocks = vi.fn();
const listAvailabilityExceptions = vi.fn();
const getAgendaViewPreference = vi.fn();

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  getProductServices: () => ({
    calendar: {
      getCalendar,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
    settings: {
      getAgendaViewPreference,
    },
  }),
}));

// Segunda-feira: `startOfWeek` começa a semana nela, e o dia anterior
// (2026-09-27) é domingo — o dia usado para provar que Dia nunca omite nada.
const ISO_TODAY = "2026-09-28";

function calendarFixture(
  overrides: Partial<CalendarState> = {},
): CalendarState {
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

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "+5511999990000" },
    customerId: "c1",
    date: ISO_TODAY,
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

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.setSystemTime(new Date(`${ISO_TODAY}T12:00:00.000Z`));
  getCalendar.mockReset();
  listAppointments.mockReset();
  listTimeBlocks.mockReset();
  listAvailabilityExceptions.mockReset();
  getAgendaViewPreference.mockReset();
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([appointmentFixture()]);
  listTimeBlocks.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Automática segue a largura", () => {
  test("abre em Semana a 1024px", async () => {
    window.innerWidth = 1024;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });

    renderBoard();

    const weekTab = await screen.findByRole("tab", { name: "Semana" });
    expect(weekTab).toHaveAttribute("aria-selected", "true");
  });

  test("abre em Dia a 390px", async () => {
    window.innerWidth = 390;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: null,
    });

    renderBoard();

    const dayTab = await screen.findByRole("tab", { name: "Dia" });
    expect(dayTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("visualização gravada vale em qualquer largura", () => {
  test("Dia gravado abre em Dia mesmo a 1024px", async () => {
    window.innerWidth = 1024;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: "DAY",
    });

    renderBoard();

    const dayTab = await screen.findByRole("tab", { name: "Dia" });
    expect(dayTab).toHaveAttribute("aria-selected", "true");
  });

  test("Mês gravado abre em Mês mesmo a 390px", async () => {
    window.innerWidth = 390;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: "MONTH",
    });

    renderBoard();

    const monthTab = await screen.findByRole("tab", { name: "Mês" });
    expect(monthTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("dias ocultos somem de Semana e Mês, nunca do Dia", () => {
  test("Semana omite o dia oculto e redistribui as colunas", async () => {
    window.innerWidth = 1024;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0], // domingo
      initialView: "WEEK",
    });

    renderBoard();

    const weekSection = await screen.findByLabelText("Mapa da semana");
    const dayHeadButtons = within(weekSection).getAllByRole("button");
    expect(dayHeadButtons.length).toBe(6);
    expect(within(weekSection).queryByText("DOM")).not.toBeInTheDocument();
  });

  test("Mês omite o dia oculto e redistribui as colunas", async () => {
    window.innerWidth = 1024;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0], // domingo
      initialView: "MONTH",
    });

    renderBoard();

    const monthSection = await screen.findByLabelText("Mapa do mês");
    expect(within(monthSection).queryByText("DOM")).not.toBeInTheDocument();
    expect(within(monthSection).getByText("SEG")).toBeVisible();
  });

  test("Dia continua navegando por todos os dias, incluindo o oculto", async () => {
    window.innerWidth = 390;
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0], // domingo; ISO_TODAY (segunda) menos 1 dia é domingo
      initialView: "DAY",
    });
    const user = userEvent.setup();

    renderBoard();

    await screen.findByLabelText(/Agenda de/);
    listAppointments.mockClear();

    await user.click(screen.getByRole("button", { name: "Dia anterior" }));

    await waitFor(() => expect(listAppointments).toHaveBeenCalled());
    const [queryWindow] = listAppointments.mock.calls.at(-1) as [
      { endDate: string; startDate: string },
    ];
    // Goal069 §2: o Dia lê a semana inteira do dia focado (não só o dia), para
    // a faixa da semana marcar ponto — 27/09 (domingo) pertence à semana de
    // 21 a 27/09, não à de 28/09 a 04/10.
    expect(queryWindow).toEqual({
      endDate: "2026-09-27",
      startDate: "2026-09-21",
    });
  });
});

describe("leitura falhada", () => {
  test("abre a Agenda em Automática sem mensagem de erro", async () => {
    window.innerWidth = 1024;
    getAgendaViewPreference.mockRejectedValue(new Error("falha de rede"));

    renderBoard();

    const weekTab = await screen.findByRole("tab", { name: "Semana" });
    expect(weekTab).toHaveAttribute("aria-selected", "true");
    expect((await screen.findAllByText("Ana Paula")).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText("Agenda indisponível")).not.toBeInTheDocument();
  });
});
