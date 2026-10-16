// @vitest-environment jsdom
/**
 * Auditoria dos esqueletos da Agenda (ampliação do pedido do usuário,
 * 2026-10-12, D-168): nenhum esqueleto em cima de conteúdo que já estava na
 * tela, e o que dá para saber antes entra na hora.
 *
 * - o esqueleto da grade só aparece se a primeira carga passar de ~150 ms:
 *   dado que chega antes entra direto, sem piscar;
 * - Cancelar e Remarcar abrem já preenchidos pelo agendamento e pelo
 *   calendário lembrados na aba (D-167), sem esqueleto, e revalidam;
 * - o mini calendário mostra os pontos do mês a partir das janelas lembradas,
 *   antes da leitura;
 * - histórico e lembrete lembrados do atendimento aparecem na hora, sem a
 *   linha reservada.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { AgendaCalendarSheet } from "@/features/agenda/AgendaCalendarSheet";
import {
  rememberAgendaWindow,
  rememberAppointment,
  rememberAppointmentHistory,
  rememberCalendar,
  rememberCustomer,
  rememberCustomers,
  rememberServiceCatalog,
} from "@/features/agenda/agendaMemory";
import { AppointmentForm } from "@/features/agenda/AppointmentForm";
import { AppointmentHistory } from "@/features/agenda/AppointmentHistory";
import { CancelFlow } from "@/features/agenda/CancelFlow";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { forget } from "@/shared/runtime/sessionMemory";

const getCalendar = vi.fn();
const getAppointment = vi.fn();
const listAppointments = vi.fn();
const listAppointmentEvents = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();
const listCatalog = vi.fn();
const listCustomers = vi.fn();

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
      listAppointmentNotifications: () => Promise.resolve([]),
      listAppointments,
      listAvailabilityExceptions,
      listTimeBlocks,
    },
    customers: { list: listCustomers },
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

beforeEach(() => {
  vi.useRealTimers();
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));
  window.innerWidth = 1366;
  window.localStorage.clear();
  forget();
  getCalendar.mockReset().mockResolvedValue(calendarFixture());
  getAppointment.mockReset().mockImplementation(never);
  listAppointments.mockReset().mockResolvedValue([]);
  listAppointmentEvents.mockReset().mockImplementation(never);
  listAvailabilityExceptions.mockReset().mockResolvedValue([]);
  listTimeBlocks.mockReset().mockResolvedValue([]);
  getAgendaViewPreference.mockReset().mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "WEEK",
  });
  getSettings.mockReset().mockResolvedValue({ availability: { rules: [] } });
  listCatalog.mockReset().mockResolvedValue({ items: [] });
  listCustomers.mockReset().mockResolvedValue({ items: [] });
});

describe("esqueleto da grade só na primeira carga, e só depois de ~150 ms", () => {
  test("dado que chega na hora entra sem esqueleto", async () => {
    listAppointments.mockResolvedValue([
      appointment("a-1", "2026-10-13", "Ana Paula"),
    ]);
    render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    await screen.findByRole("region", { name: "Mapa da semana" });
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
  });

  test("carga que demora mostra o esqueleto depois do atraso", async () => {
    getCalendar.mockImplementation(never);
    render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(
      await screen.findByLabelText("Carregando agenda"),
    ).toBeInTheDocument();
  });
});

describe("fluxos semeados pela memória da aba", () => {
  test("Cancelar abre já preenchido, sem esqueleto, e revalida em segundo plano", async () => {
    const ana = appointment("a-1", "2026-10-13", "Ana Paula");
    rememberCalendar(calendarFixture());
    rememberAppointment(ana);
    getAppointment.mockResolvedValue({ ...ana, notes: "revalidado" });
    const { container } = render(
      <ShellConfigProvider>
        <CancelFlow appointmentId="a-1" />
      </ShellConfigProvider>,
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText(/Ana Paula/)).toBeVisible();
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getAppointment).toHaveBeenCalledWith("a-1", expect.any(AbortSignal));
    expect(screen.getByText(/Ana Paula/)).toBeVisible();
  });

  test("sem memória, Cancelar carrega como antes — e o esqueleto só aparece depois de ~150 ms", async () => {
    const { container } = render(
      <ShellConfigProvider>
        <CancelFlow appointmentId="a-1" />
      </ShellConfigProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    // Dado que chega antes do atraso nunca mostra o esqueleto (D-168).
    expect(container.querySelector(".skeleton")).toBeNull();
    await waitFor(() =>
      expect(container.querySelector(".skeleton")).not.toBeNull(),
    );
  });
});

describe("mini calendário com os pontos da memória", () => {
  test("a janela lembrada marca os dias antes da leitura chegar", () => {
    rememberAgendaWindow({
      appointments: [appointment("a-1", "2026-10-21", "Ana Paula")],
      endDate: "2026-11-08",
      exceptions: [],
      source: "AVENLY",
      startDate: "2026-09-28",
      timeBlocks: [],
    });
    listAppointments.mockImplementation(never);
    render(
      <AgendaCalendarSheet
        avenly
        focusedDate={new Date(2026, 9, 12)}
        onClose={() => {}}
        onPick={() => {}}
        source="AVENLY"
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Calendário" });
    expect(
      within(dialog).getByRole("button", {
        name: /quarta-feira, 21 de outubro, com atendimentos/,
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", {
        name: /^terça-feira, 20 de outubro$/,
      }),
    ).toBeVisible();
  });
});

describe("histórico lembrado do atendimento", () => {
  test("aparece na hora, sem a linha reservada; sem memória, a linha reservada fica", () => {
    rememberAppointmentHistory("a-1", [
      {
        actor: null,
        id: "e-1",
        occurredAt: "2026-10-12T13:00:00.000Z",
        type: "CREATED",
      } as never,
    ]);
    const seeded = render(<AppointmentHistory appointmentId="a-1" />);
    expect(
      seeded.container.querySelector(".agenda-appt-history-reserved"),
    ).toBeNull();
    expect(
      seeded.container.querySelectorAll(".agenda-appt-history-item"),
    ).toHaveLength(1);
    seeded.unmount();

    const cold = render(<AppointmentHistory appointmentId="a-2" />);
    expect(
      cold.container.querySelector(".agenda-appt-history-reserved"),
    ).not.toBeNull();
  });
});

describe("Novo agendamento abre pronto (pedido do usuário, 2026-10-12)", () => {
  test("com o calendário e as listas lembrados, o formulário abre sem esqueleto, com o campo Cliente na hora", () => {
    rememberCalendar(calendarFixture());
    rememberServiceCatalog({ items: [] } as never);
    rememberCustomers({ items: [] } as never);
    getCalendar.mockImplementation(never);
    listCatalog.mockImplementation(never);
    listCustomers.mockImplementation(never);
    const { container } = render(
      <ShellConfigProvider>
        <AppointmentForm />
      </ShellConfigProvider>,
    );
    expect(screen.queryByLabelText("Carregando agenda")).toBeNull();
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(screen.getByText("Cliente")).toBeVisible();
  });

  test('"Agendar" do perfil (2026-10-16): com a cliente lembrada, abre com ela escolhida sem esperar a lista de clientes', () => {
    rememberCalendar(calendarFixture());
    rememberServiceCatalog({ items: [] } as never);
    rememberCustomer({ id: "c-9", name: "Marina Costa", phone: null });
    getCalendar.mockImplementation(never);
    listCatalog.mockImplementation(never);
    // A lista inteira de clientes nunca responde: a tela não espera por ela.
    listCustomers.mockImplementation(never);
    const { container } = render(
      <ShellConfigProvider>
        <AppointmentForm customerId="c-9" />
      </ShellConfigProvider>,
    );
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Remover Marina Costa" }),
    ).toBeVisible();
  });

  test("sem a cliente lembrada, a cliente da URL ainda espera a lista (não abre com o campo vazio)", () => {
    rememberCalendar(calendarFixture());
    rememberServiceCatalog({ items: [] } as never);
    getCalendar.mockImplementation(never);
    listCatalog.mockImplementation(never);
    listCustomers.mockImplementation(never);
    render(
      <ShellConfigProvider>
        <AppointmentForm customerId="c-9" />
      </ShellConfigProvider>,
    );
    expect(screen.queryByRole("form", { name: "Novo agendamento" })).toBeNull();
  });

  test('abrir a folha do "+ Novo" pré-lê serviços e clientes para a memória da aba', async () => {
    listAppointments.mockResolvedValue([]);
    render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );
    await screen.findByRole("region", { name: "Mapa da semana" });
    const before = listCustomers.mock.calls.length;
    await act(async () => {
      screen.getByRole("button", { name: "Novo" }).click();
      await Promise.resolve();
    });
    expect(
      screen.getByRole("dialog", { name: "O que você quer adicionar?" }),
    ).toBeVisible();
    expect(listCustomers.mock.calls.length).toBeGreaterThan(before);
    expect(listCatalog).toHaveBeenCalled();
  });
});
