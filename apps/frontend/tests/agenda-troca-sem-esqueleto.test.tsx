// @vitest-environment jsdom
/**
 * Troca de visão sem esqueleto (pedido do usuário, 2026-10-12, D-168): o
 * vídeo dele mostrava, ao trocar Semana → Mês → Semana, a grade sumindo e o
 * esqueleto genérico aparecendo por ~100 ms antes do conteúdo novo — uma
 * piscada em vez de uma transição. A regra:
 *
 * - trocar de visão (abas), andar com as setas ou escolher no mini
 *   calendário com a janela ainda na rede mantém a visão atual visível, com
 *   `aria-busy` na região do conteúdo, e nunca mostra o esqueleto da grade;
 * - quando a janela chega, a visão nova aparece (no navegador, numa View
 *   Transition conteúdo → conteúdo);
 * - voltar a uma janela já lida nesta aba (memória de D-167) é imediato, sem
 *   leitura bloqueante — a releitura corre em segundo plano;
 * - o esqueleto da grade fica só para a primeira carga, quando não há nada
 *   na tela.
 *
 * Relógio fixo: segunda 12/10/2026, 10:00. Semana de 12/10 a 18/10; a grade
 * do Mês vai de 28/09 a 01/11.
 */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { forget } from "@/shared/runtime/sessionMemory";

const getCalendar = vi.fn();
const listAppointments = vi.fn();
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
      getCalendar,
      listAppointmentEvents: () => Promise.resolve([]),
      listAppointmentNotifications: () => Promise.resolve([]),
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

/** Uma leitura cuja resposta o teste libera quando quiser. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function renderBoard() {
  return render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
}

const weekRange = { endDate: "2026-10-18", startDate: "2026-10-12" };
const monthRange = { endDate: "2026-11-01", startDate: "2026-09-28" };

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));
  window.innerWidth = 1366;
  window.localStorage.clear();
  forget();
  getCalendar.mockReset().mockResolvedValue(calendarFixture());
  listAppointments.mockReset();
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

describe("troca de visão sem esqueleto", () => {
  test("Semana → Mês com a leitura pendente mantém a Semana visível, com aria-busy, e o Mês entra quando a janela chega", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const month = deferred<Appointment[]>();
    listAppointments.mockImplementation((range: { startDate: string }) =>
      range.startDate === monthRange.startDate
        ? month.promise
        : Promise.resolve([appointment("a-1", "2026-10-13", "Ana Paula")]),
    );
    renderBoard();
    const week = await screen.findByRole("region", { name: "Mapa da semana" });
    expect(within(week).getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Mês" }));

    // A aba já responde; o conteúdo antigo fica, ocupado, sem esqueleto.
    expect(screen.getByRole("tab", { name: "Mês" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "Mapa da semana" }),
    ).toBeVisible();
    expect(screen.queryByRole("region", { name: "Mapa do mês" })).toBeNull();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    const content = document.querySelector(".agenda-content");
    expect(content).toHaveAttribute("aria-busy", "true");
    expect(listAppointments).toHaveBeenCalledWith(
      monthRange,
      expect.any(AbortSignal),
    );

    await act(async () => {
      month.resolve([appointment("a-2", "2026-10-28", "Bia Castro")]);
      await Promise.resolve();
    });

    const monthMap = await screen.findByRole("region", {
      name: "Mapa do mês",
    });
    expect(monthMap).toBeVisible();
    expect(screen.queryByRole("region", { name: "Mapa da semana" })).toBeNull();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".agenda-content")).not.toHaveAttribute(
      "aria-busy",
    );
  });

  test("voltar para uma visão já lida é imediato e não espera leitura nenhuma", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    listAppointments.mockResolvedValue([
      appointment("a-1", "2026-10-13", "Ana Paula"),
    ]);
    renderBoard();
    await screen.findByRole("region", { name: "Mapa da semana" });
    await user.click(screen.getByRole("tab", { name: "Mês" }));
    await screen.findByRole("region", { name: "Mapa do mês" });

    // A partir daqui nenhuma leitura responde: só a memória pode trazer a Semana.
    listAppointments.mockReturnValue(
      new Promise<Appointment[]>(() => undefined),
    );
    const callsBefore = listAppointments.mock.calls.length;
    await user.click(screen.getByRole("tab", { name: "Semana" }));

    const week = screen.getByRole("region", { name: "Mapa da semana" });
    expect(within(week).getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Mapa do mês" })).toBeNull();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".agenda-content")).not.toHaveAttribute(
      "aria-busy",
    );
    // A releitura corre em segundo plano, sem bloquear a tela.
    expect(listAppointments.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(listAppointments).toHaveBeenLastCalledWith(
      weekRange,
      expect.any(AbortSignal),
    );
  });

  test("as setas com a janela pendente também seguram o conteúdo, e o esqueleto fica só para a primeira carga", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const first = deferred<Appointment[]>();
    const next = deferred<Appointment[]>();
    listAppointments.mockImplementation((range: { startDate: string }) =>
      range.startDate === weekRange.startDate
        ? first.promise
        : range.startDate === "2026-10-19"
          ? next.promise
          : Promise.resolve([]),
    );
    renderBoard();
    // Primeira carga: nada na tela, o esqueleto da grade é o certo.
    // (O esqueleto de antes do calendário dá lugar ao da grade; o segundo é o que vale.)
    await screen.findByLabelText("Carregando agenda");
    await screen.findByRole("tab", { name: "Semana" });
    expect(screen.getByLabelText("Carregando agenda")).toBeInTheDocument();
    await act(async () => {
      first.resolve([appointment("a-1", "2026-10-13", "Ana Paula")]);
      await Promise.resolve();
    });
    await screen.findByRole("region", { name: "Mapa da semana" });
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(screen.getByText("Ana Paula")).toBeVisible();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(document.querySelector(".agenda-content")).toHaveAttribute(
      "aria-busy",
      "true",
    );

    await act(async () => {
      next.resolve([appointment("a-3", "2026-10-20", "Carla Nunes")]);
      await Promise.resolve();
    });
    expect(await screen.findByText("Carla Nunes")).toBeVisible();
    expect(screen.queryByText("Ana Paula")).toBeNull();
    expect(document.querySelector(".agenda-content")).not.toHaveAttribute(
      "aria-busy",
    );
  });
});
