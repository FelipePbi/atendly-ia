// @vitest-environment jsdom
/**
 * Pedido de 2026-10-12 (celular e desktop): na Semana, tocar no cabeçalho de
 * um dia ("QUI 15") levava para a visão Dia. Problema evitado: agora o
 * cabeçalho só escolhe o dia — a coluna dele fica destacada (fundo suave e
 * número cheio, com `aria-pressed`, nunca só cor), o resumo abaixo da grade
 * passa a mostrar esse dia e é anunciado sem tirar o foco — e "Abrir dia" no
 * resumo continua levando ao Dia.
 *
 * Relógio fixo: segunda 12/10/2026, 12:00. Semana exibida: 12 a 18/10.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Appointment, CalendarState } from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const listAppointments = vi.fn();
const getAgendaViewPreference = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/shared/runtime/ProductRuntime", () => ({
  useProductRuntime: () => ({ session: null }),
  getProductServices: () => ({
    calendar: {
      getAppointment: () => new Promise(() => undefined),
      getCalendar: () => Promise.resolve(calendarFixture()),
      listAppointmentEvents: () => Promise.resolve([]),
      listAppointmentNotifications: () => Promise.resolve([]),
      listAppointments,
      listAvailabilityExceptions: () => Promise.resolve([]),
      listTimeBlocks: () => Promise.resolve([]),
    },
    serviceCatalog: { list: () => Promise.resolve({ items: [] }) },
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

function appointment(
  id: string,
  name: string,
  date: string,
  startTime: string,
  endTime: string,
): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: `c-${id}`, name, phone: "5511998887766" },
    customerId: `c-${id}`,
    date,
    durationMinutes: 75,
    endTime,
    finalValue: null,
    id,
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [
      {
        durationMinutes: 75,
        name: "Manutenção Brasileiro",
        price: 100,
        priceType: "FIXED",
        serviceId: "s-brasileiro",
      },
    ],
    source: "USER",
    startTime,
    status: "CONFIRMED",
    title: null,
    totalPrice: 100,
    totalPriceType: "FIXED",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 1366;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
  listAppointments.mockResolvedValue([
    appointment("a1", "Amanda Guntzel", "2026-10-15", "08:30", "09:45"),
    appointment("a2", "Bia Castro", "2026-10-15", "14:00", "15:15"),
    appointment("a3", "Carla Nunes", "2026-10-12", "10:00", "11:15"),
  ]);
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: "WEEK",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setup() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

function renderBoard(initialDate?: string) {
  return render(
    <ShellConfigProvider>
      <AgendaBoard initialDate={initialDate} />
    </ShellConfigProvider>,
  );
}

async function week() {
  return screen.findByRole("region", { name: "Mapa da semana" });
}

function head(region: HTMLElement, name: RegExp) {
  return within(region).getByRole("button", { name });
}

function summary() {
  return screen.getByRole("region", { name: "Resumo do dia" });
}

describe("Semana: o cabeçalho do dia escolhe o dia, não abre o Dia (2026-10-12)", () => {
  test("ao abrir, hoje vem escolhido", async () => {
    renderBoard();
    const region = await week();
    const today = head(region, /^SEG\s*12, mostrar segunda, 12 de outubro/);
    expect(today).toHaveAttribute("aria-pressed", "true");
    expect(today.closest(".week-map-day")).toHaveClass("is-selected");
    expect(summary()).toHaveTextContent(/Hoje/);
  });

  test("clicar em QUI 15 continua na Semana, marca a coluna 15 e o resumo mostra 'Quinta, 15'; 'Abrir dia' leva ao Dia 15", async () => {
    const user = setup();
    const { container } = renderBoard();
    const region = await week();
    const thursday = head(region, /^QUI\s*15, mostrar quinta, 15 de outubro/);
    expect(thursday).toHaveTextContent("QUI15");

    await user.click(thursday);

    expect(screen.getByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Dia", selected: true })).toBeNull();
    expect(thursday).toHaveAttribute("aria-pressed", "true");
    expect(thursday.closest(".week-map-day")).toHaveClass("is-selected");
    const monday = head(region, /^SEG\s*12, mostrar segunda, 12 de outubro/);
    expect(monday).toHaveAttribute("aria-pressed", "false");
    expect(monday.closest(".week-map-day")).not.toHaveClass("is-selected");
    expect(summary()).toHaveTextContent("Quinta, 15");
    expect(summary()).toHaveTextContent("2 atendimentos");
    expect(summary()).toHaveTextContent("Manutenção Brasileiro ×2");
    // O título do resumo é anunciado sem tirar o foco do cabeçalho.
    expect(
      summary().querySelector(".agenda-summary-heading"),
    ).toHaveAttribute("aria-live", "polite");
    await expectNoA11yViolations(container);

    await user.click(within(summary()).getByRole("button", { name: "Abrir dia" }));
    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "Quinta, 15",
    );
  });

  test("teclado: Enter e Espaço escolhem o dia e o foco fica no cabeçalho", async () => {
    const user = setup();
    renderBoard();
    const region = await week();

    const thursday = head(region, /^QUI\s*15, mostrar quinta, 15 de outubro/);
    thursday.focus();
    await user.keyboard("{Enter}");
    expect(thursday).toHaveAttribute("aria-pressed", "true");
    expect(thursday).toHaveFocus();
    expect(summary()).toHaveTextContent("Quinta, 15");

    const friday = head(region, /^SEX\s*16, mostrar sexta, 16 de outubro/);
    friday.focus();
    await user.keyboard(" ");
    expect(friday).toHaveAttribute("aria-pressed", "true");
    expect(thursday).toHaveAttribute("aria-pressed", "false");
    expect(summary()).toHaveTextContent("Sexta, 16");
    expect(screen.getByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("?dia=2026-10-15 abre a Semana com o dia 15 escolhido", async () => {
    renderBoard("2026-10-15");
    const region = await week();
    expect(head(region, /^QUI\s*15, mostrar quinta, 15 de outubro/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(summary()).toHaveTextContent("Quinta, 15");
  });

  test("trocar de semana pelas setas mantém o dia da semana escolhido", async () => {
    const user = setup();
    renderBoard();
    const region = await week();
    await user.click(head(region, /^QUI\s*15, mostrar quinta, 15 de outubro/));

    await user.click(screen.getByRole("button", { name: "Próxima semana" }));

    expect(
      head(await week(), /^QUI\s*22, mostrar quinta, 22 de outubro/),
    ).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toHaveTextContent("Quinta, 22");
  });

  test("dia escondido pela preferência não fica escolhido: vale o primeiro dia exibido", async () => {
    // Hoje é segunda; com as segundas escondidas, a terça 13 é a primeira.
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [1],
      initialView: "WEEK",
    });
    renderBoard();
    const region = await week();
    expect(
      await within(region).findByRole("button", {
        name: /^TER\s*13, mostrar terça, 13 de outubro/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toHaveTextContent("Terça, 13");
  });
});
