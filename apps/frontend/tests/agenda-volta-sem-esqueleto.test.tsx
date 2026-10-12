// @vitest-environment jsdom
/**
 * Nenhum esqueleto nas transições da Agenda (pedido do usuário, 2026-10-12,
 * revisão de D-168). O que o usuário ainda via, medido no Chromium com a rede
 * a 300 ms de latência, e a regra que o elimina:
 *
 * - voltar à Agenda (do detalhe, de um fluxo, de outra seção) remontava a
 *   tela do zero e mostrava o esqueleto da grade por ~850 ms: agora ela
 *   começa pelo calendário e pela janela que esta aba já leu e revalida em
 *   segundo plano;
 * - as linhas reservadas do histórico e do lembrete do atendimento ganhavam
 *   o brilho de esqueleto ao abrir o detalhe ou escolher no painel do Dia:
 *   agora reservam o lugar sem brilho, sempre;
 * - Remarcar e Cancelar sem memória pintavam o esqueleto no primeiro quadro:
 *   agora só depois de ~150 ms, como o resto.
 *
 * Relógio fixo: segunda 12/10/2026, 10:00. Semana de 12/10 a 18/10.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import {
  rememberAgendaWindow,
  rememberCalendar,
  rememberServiceColors,
} from "@/features/agenda/agendaMemory";
import { AppointmentHistory } from "@/features/agenda/AppointmentHistory";
import { BlockSeriesForm } from "@/features/agenda/BlockSeriesForm";
import { AppointmentReminder } from "@/features/agenda/LifecycleActions";
import { RescheduleFlow } from "@/features/agenda/RescheduleFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { forget } from "@/shared/runtime/sessionMemory";

const getCalendar = vi.fn();
const getAppointment = vi.fn();
const listAppointments = vi.fn();
const listAppointmentEvents = vi.fn();
const listAppointmentNotifications = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();
const listCatalog = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      getAppointment,
      getCalendar,
      listAppointmentEvents,
      listAppointmentNotifications,
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
    serviceCatalog: { list: listCatalog },
    settings: { get: getSettings, getAgendaViewPreference },
  }),
}));

function calendarFixture(): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

function appointment(id: string, date: string, name: string): Appointment {
  return {
    createdAt: `${date}T10:00:00.000Z`,
    customer: { id: `c-${id}`, name, phone: null },
    customerId: `c-${id}`,
    date,
    durationMinutes: 60,
    endTime: "11:00",
    id,
    notes: null,
    presenceConfirmedAt: null,
    services: [
      {
        durationMinutes: 60,
        name: "Corte",
        price: 90,
        priceType: "FIXED",
        serviceId: "s-1",
      },
    ],
    source: "MANUAL",
    startAt: `${date}T13:00:00.000Z`,
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
  } as unknown as Appointment;
}

function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const weekRange = { endDate: "2026-10-18", startDate: "2026-10-12" };

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));
  window.innerWidth = 1366;
  window.localStorage.clear();
  forget();
  getCalendar.mockReset().mockResolvedValue(calendarFixture());
  getAppointment.mockReset().mockImplementation(never);
  listAppointments.mockReset().mockResolvedValue([]);
  listAppointmentEvents.mockReset().mockImplementation(never);
  listAppointmentNotifications.mockReset().mockImplementation(never);
  listAvailabilityExceptions.mockReset().mockResolvedValue([]);
  listTimeBlocks.mockReset().mockResolvedValue([]);
  getAgendaViewPreference.mockReset().mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "WEEK",
  });
  getSettings.mockReset().mockResolvedValue({ availability: { rules: [] } });
  listCatalog.mockReset().mockResolvedValue({ items: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("voltar à Agenda começa pelo que a aba já leu (revisão de D-168)", () => {
  test("com o calendário e a janela lembrados, a grade aparece no primeiro quadro, sem esqueleto, e a releitura corre em segundo plano", async () => {
    rememberCalendar(calendarFixture());
    rememberAgendaWindow({
      appointments: [appointment("a-1", "2026-10-13", "Ana Paula")],
      exceptions: [],
      source: "AVENLY",
      timeBlocks: [],
      ...weekRange,
    });
    rememberServiceColors(new Map([["s-1", "ROSE" as const]]));
    const reread = deferred<Appointment[]>();
    listAppointments.mockReturnValue(reread.promise);

    renderBoard();

    // Primeiro quadro: a Semana lembrada, com o atendimento, e nada de esqueleto.
    const week = screen.getByRole("region", { name: "Mapa da semana" });
    expect(within(week).getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".skeleton")).toBeNull();
    expect(document.querySelector(".agenda-content")).not.toHaveAttribute(
      "aria-busy",
    );

    // Mesmo com a leitura demorando, o esqueleto não aparece depois.
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".skeleton")).toBeNull();

    // A janela na tela é relida, sem bloquear.
    await waitFor(() =>
      expect(listAppointments).toHaveBeenCalledWith(
        weekRange,
        expect.any(AbortSignal),
      ),
    );
    await act(async () => {
      reread.resolve([appointment("a-2", "2026-10-14", "Bia Castro")]);
      await Promise.resolve();
    });
    expect(await screen.findByText("Bia Castro")).toBeVisible();
    expect(screen.queryByText("Ana Paula")).toBeNull();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
  });

  test("sem memória, a primeira carga segue como antes: esqueleto da grade só depois de ~150 ms", async () => {
    getCalendar.mockImplementation(never);
    renderBoard();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(await screen.findByLabelText("Carregando agenda")).toBeVisible();
  });
});

describe("linhas reservadas do atendimento nunca viram esqueleto", () => {
  test("o histórico carregando reserva a linha, mas sem a classe skeleton, mesmo depois de ~150 ms", async () => {
    const { container } = render(<AppointmentHistory appointmentId="a-1" />);
    expect(
      container.querySelector(".agenda-appt-history-reserved"),
    ).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(
      container.querySelector(".agenda-appt-history-reserved"),
    ).not.toBeNull();
    expect(container.querySelector(".skeleton")).toBeNull();
  });

  test("o lembrete carregando reserva o bloco, mas sem a classe skeleton, mesmo depois de ~150 ms", async () => {
    const { container } = render(<AppointmentReminder appointmentId="a-1" />);
    expect(
      container.querySelector(".agenda-appt-reminder-reserved"),
    ).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(container.querySelector(".skeleton")).toBeNull();
  });
});

describe("série de bloqueio começa pelo calendário lembrado", () => {
  test("com o calendário na memória da aba, o formulário abre sem esqueleto e revalida", async () => {
    rememberCalendar(calendarFixture());
    const reread = deferred<CalendarState>();
    getCalendar.mockReturnValue(reread.promise);
    render(
      <ShellConfigProvider>
        <BlockSeriesForm />
      </ShellConfigProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Criar série de bloqueio" }),
    ).toBeVisible();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".skeleton")).toBeNull();
    expect(getCalendar).toHaveBeenCalled();
  });
});

describe("Remarcar sem memória", () => {
  test("não pinta o esqueleto no primeiro quadro; só depois de ~150 ms", async () => {
    const { container } = render(
      <ShellConfigProvider>
        <RescheduleFlow appointmentId="a-1" />
      </ShellConfigProvider>,
    );
    expect(container.querySelector(".skeleton")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });
    expect(container.querySelector(".skeleton")).not.toBeNull();
  });
});
