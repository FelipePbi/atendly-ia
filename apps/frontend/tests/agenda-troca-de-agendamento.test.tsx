// @vitest-environment jsdom
/**
 * Trocar de agendamento só troca o painel ao lado (pedido do usuário,
 * 2026-10-16). O vídeo dele, no painel do Dia em /agenda, mostrava a tela
 * "dando refresh" a cada clique e leituras sobrando. A medida no navegador
 * achou três causas, e cada uma tem uma regressão aqui:
 *
 * 1. Duas View Transitions por clique: a da semente da lista e outra quando a
 *    leitura chegava, que cortava a primeira — o painel trocava seco.
 * 2. `agenda-content` (a lista do Dia inteira) esmaecia e voltava junto com o
 *    painel, em toda troca.
 * 3. O catálogo de serviços relido a cada atendimento, no painel e na rota
 *    `/agenda/agendamento`; na rota, o calendário também.
 *
 * Relógio fixo: terça 29/09/2026, 12:00.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { AppointmentDetail } from "@/features/agenda/AppointmentDetail";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";
import { forget } from "@/shared/runtime/sessionMemory";

const getAppointment = vi.fn();
const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listCatalog = vi.fn();
const getAgendaViewPreference = vi.fn();
const getCustomer = vi.fn();
const listConversations = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      getAppointment,
      getCalendar,
      listAppointmentEvents: () => Promise.resolve([]),
      listAppointmentNotifications: () => Promise.resolve([]),
      listAppointments,
      listAvailabilityExceptions: () => Promise.resolve([]),
      listTimeBlocks: () => Promise.resolve([]),
    },
    conversations: { list: listConversations },
    customers: { get: getCustomer },
    serviceCatalog: { list: listCatalog },
    settings: {
      get: () => Promise.resolve({ availability: { rules: [] } }),
      getAgendaViewPreference,
    },
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

function appointmentFixture(overrides: Partial<Appointment> = {}): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: "5511998887766" },
    customerId: "c1",
    date: "2026-09-29",
    durationMinutes: 60,
    endTime: "15:00",
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
    startTime: "14:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
    ...overrides,
  };
}

const ana = () => appointmentFixture();
const bruna = () =>
  appointmentFixture({
    customer: { id: "c2", name: "Bruna Costa", phone: "5511977776655" },
    customerId: "c2",
    endTime: "17:00",
    id: "apt-2",
    startTime: "16:00",
  });

/** As classes `vt-*` de cada View Transition iniciada. */
function stubViewTransition() {
  const transitions: string[][] = [];
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      transitions.push(
        [...document.documentElement.classList].filter((name) =>
          name.startsWith("vt-"),
        ),
      );
      update();
      return { finished: Promise.resolve() };
    },
  });
  return transitions;
}

/** A partir de 1024 px, com o movimento reduzido do Windows do usuário. */
function stubWideReducedMotion() {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        addEventListener: () => undefined,
        matches: true,
        media: query,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  forget();
  window.innerWidth = 1366;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([ana(), bruna()]);
  getAppointment.mockImplementation((id: string) =>
    Promise.resolve(id === "apt-2" ? bruna() : ana()),
  );
  listCatalog.mockResolvedValue({ items: [] });
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "DAY",
  });
  getCustomer.mockImplementation((id: string) =>
    Promise.resolve({ appointmentStats: { completed: id === "c1" ? 3 : 1 } }),
  );
  listConversations.mockImplementation(
    ({ customerId }: { customerId: string }) =>
      Promise.resolve([{ id: `conv-${customerId}` }]),
  );
  stubWideReducedMotion();
});

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("trocar de agendamento só troca o painel (2026-10-16)", () => {
  test("no painel do Dia: uma transição appointment-swap por clique, sem reler o dia, o calendário nem o catálogo, e sem remontar a lista", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ShellConfigProvider>
        <AgendaBoard />
      </ShellConfigProvider>,
    );
    const panel = () =>
      within(
        screen.getByRole("complementary", { name: "Detalhe do agendamento" }),
      );

    await user.click(await screen.findByRole("button", { name: /Ana Paula/ }));
    expect(
      await panel().findByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.querySelector(".agenda-appt")).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    const dayList = document.querySelector(".agenda-day-list");
    const readsBefore = {
      calendar: getCalendar.mock.calls.length,
      catalog: listCatalog.mock.calls.length,
      day: listAppointments.mock.calls.length,
    };
    const transitions = stubViewTransition();

    await user.click(screen.getByRole("button", { name: /Bruna Costa/ }));
    expect(
      await panel().findByRole("heading", { name: "Bruna Costa" }),
    ).toBeVisible();
    // A leitura de B chega e completa o painel no lugar.
    await waitFor(() =>
      expect(document.querySelector(".agenda-appt")).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(transitions).toEqual([["vt-appointment-swap"]]);
    expect(getAppointment).toHaveBeenLastCalledWith(
      "apt-2",
      expect.anything(),
    );
    expect(getCalendar).toHaveBeenCalledTimes(readsBefore.calendar);
    expect(listAppointments).toHaveBeenCalledTimes(readsBefore.day);
    expect(listCatalog).toHaveBeenCalledTimes(readsBefore.catalog);
    expect(document.querySelector(".agenda-day-list")).toBe(dayList);
  });

  test("na rota /agenda/agendamento: uma transição por troca, e o calendário e o catálogo não são relidos", async () => {
    const view = render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();
    const column = await screen.findByRole("link", { name: /Bruna Costa/ });
    await waitFor(() =>
      expect(document.querySelector(".agenda-appt")).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    const readsBefore = {
      calendar: getCalendar.mock.calls.length,
      catalog: listCatalog.mock.calls.length,
      day: listAppointments.mock.calls.length,
    };
    const transitions = stubViewTransition();

    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-2" />
      </ShellConfigProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Bruna Costa" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.querySelector(".agenda-appt")).not.toHaveAttribute(
        "aria-busy",
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(transitions).toEqual([["vt-appointment-swap"]]);
    expect(getCalendar).toHaveBeenCalledTimes(readsBefore.calendar);
    expect(listCatalog).toHaveBeenCalledTimes(readsBefore.catalog);
    expect(listAppointments).toHaveBeenCalledTimes(readsBefore.day);
    expect(column).toBeInTheDocument();
  });

  test("voltar a uma pessoa já vista mostra a contagem e o atalho da conversa na hora, sem esperar a releitura", async () => {
    const view = render(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    expect(await screen.findByText(/3 atendimentos/)).toBeVisible();
    expect(
      await screen.findByRole("link", { name: "Conversa" }),
    ).toHaveAttribute("href", "/conversas/conv-c1");

    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-2" />
      </ShellConfigProvider>,
    );
    expect(await screen.findByText(/· 1 atendimento$/)).toBeVisible();

    // A releitura de Ana fica na rede: o que a aba já sabe aparece antes.
    getCustomer.mockImplementation(() => new Promise(() => undefined));
    listConversations.mockImplementation(() => new Promise(() => undefined));
    view.rerender(
      <ShellConfigProvider>
        <AppointmentDetail appointmentId="apt-1" />
      </ShellConfigProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Ana Paula" }),
    ).toBeVisible();
    expect(screen.getByText(/3 atendimentos/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Conversa" })).toHaveAttribute(
      "href",
      "/conversas/conv-c1",
    );
  });

  test("na troca, a lista do Dia e a moldura do painel saem da transição: só o conteúdo do painel faz o crossfade", () => {
    const css = readFileSync(
      path.join(__dirname, "../src/shared/styles/avenly-motion.css"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = css.match(
      /html\.vt-appointment-swap \.motion-stepped,\s*html\.vt-appointment-swap \.agenda-day-detail\.is-appointment\s*\{\s*view-transition-name:\s*none;\s*\}/,
    );
    expect(rule).not.toBeNull();
  });
});
