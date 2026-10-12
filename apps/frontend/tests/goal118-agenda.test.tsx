// @vitest-environment jsdom
/**
 * Goal118: o dia vazio do quadro A2 ("você não atende neste dia" no resumo e
 * a frase da IA por dia da semana), o mini-calendário do quadro A3 (aberto
 * pelo título), a folha "O que você quer adicionar?" do quadro A4, que tomou
 * o lugar do menu suspenso de "Novo", e a folha "Dias visíveis" do quadro
 * A12, aberta pela pílula.
 *
 * Relógio fixo: terça 29/09/2026, 12:00. "Próximo dia" leva à quarta 30.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  type Appointment,
  type AvailabilityException,
  BffHttpError,
  type CalendarState,
  type TimeBlock,
} from "@/data";
import { AgendaBoard } from "@/features/agenda/AgendaBoard";
import { ShellConfigProvider } from "@/shared/layout/ShellConfig";

import { expectNoA11yViolations } from "./support/a11y";

const getCalendar = vi.fn();
const listAppointments = vi.fn();
const listAvailabilityExceptions = vi.fn();
const listTimeBlocks = vi.fn();
const getAgendaViewPreference = vi.fn();
const getSettings = vi.fn();
const listCatalog = vi.fn();
const updateAgendaViewPreference = vi.fn();

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
    settings: {
      get: getSettings,
      getAgendaViewPreference,
      updateAgendaViewPreference,
    },
  }),
}));

const SHEET = "O que você quer adicionar?";

function calendarFixture(
  capabilities: Partial<CalendarState["capabilities"]> = {},
): CalendarState {
  return {
    capabilities: {
      createAppointments: true,
      manageAvailability: true,
      manageCustomers: true,
      manageServices: true,
      migrate: false,
      ...capabilities,
    },
    integration: null,
    source: "AVENLY",
    timezone: "America/Sao_Paulo",
  };
}

function rulesFor(...days: number[]) {
  return {
    availability: {
      rules: days.map((dayOfWeek) => ({
        active: true,
        dayOfWeek,
        endTime: "18:00",
        id: `r${dayOfWeek}`,
        startTime: "09:00",
      })),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.innerWidth = 390;
  window.history.pushState({}, "", "/agenda");
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
  getCalendar.mockResolvedValue(calendarFixture());
  listAppointments.mockResolvedValue([]);
  listAvailabilityExceptions.mockResolvedValue([]);
  listTimeBlocks.mockResolvedValue([]);
  getAgendaViewPreference.mockResolvedValue({
    hiddenWeekdays: [],
    initialView: null,
  });
  getSettings.mockResolvedValue(rulesFor(1));
  listCatalog.mockResolvedValue({ items: [] });
  updateAgendaViewPreference.mockImplementation(
    (input: { hiddenWeekdays: number[] }) =>
      Promise.resolve({ hiddenWeekdays: input.hiddenWeekdays, initialView: null }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

async function renderBoard() {
  const view = render(
    <ShellConfigProvider>
      <AgendaBoard />
    </ShellConfigProvider>,
  );
  await screen.findByRole("tab", { name: "Dia" });
  return view;
}

async function goToWednesday(user: ReturnType<typeof setup>) {
  await user.click(await screen.findByRole("button", { name: "Próximo dia" }));
  await screen.findByText("Nenhum atendimento neste dia.");
}

describe("A2 — dia vazio num dia em que o negócio não atende", () => {
  test("o resumo diz '{Dia}, {d} · você não atende neste dia' e o corpo cita o dia da semana no plural", async () => {
    const user = setup();
    await renderBoard();
    await goToWednesday(user);

    const summary = document.querySelector(".agenda-day-summary");
    expect(summary).toHaveTextContent("Quarta, 30");
    expect(summary).toHaveTextContent("você não atende neste dia");
    expect(summary).not.toHaveTextContent("atendimentos");
    expect(
      screen.getByText(
        "A IA não marca horários às quartas, mas você pode criar um atendimento por conta própria.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Criar agendamento" }),
    ).toHaveAttribute("href", "/agenda/novo");
  });

  test("sábado leva 'aos'", async () => {
    const user = setup();
    await renderBoard();
    await goToWednesday(user);
    for (let i = 0; i < 3; i += 1) {
      await user.click(screen.getByRole("button", { name: "Próximo dia" }));
    }

    expect(
      await screen.findByText(/^A IA não marca horários aos sábados, mas/),
    ).toBeVisible();
  });

  test("sem createAppointments a frase termina sem 'mas você pode criar…' e o botão some", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ createAppointments: false }),
    );
    const user = setup();
    await renderBoard();
    await goToWednesday(user);

    expect(
      screen.getByText("A IA não marca horários às quartas."),
    ).toBeVisible();
    expect(screen.queryByText(/mas você pode criar/)).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Criar agendamento" }),
    ).toBeNull();
  });

  test("com disponibilidade no dia o corpo fica como antes, sem o motivo", async () => {
    getSettings.mockResolvedValue(rulesFor(1, 3));
    const user = setup();
    await renderBoard();
    await goToWednesday(user);

    expect(screen.queryByText(/você não atende/)).toBeNull();
    expect(screen.queryByText(/A IA não marca horários/)).toBeNull();
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "0 atendimentos",
    );
    expect(
      screen.getByRole("link", { name: "Criar agendamento" }),
    ).toBeVisible();
  });

  test("com a disponibilidade ainda não lida o corpo fica como antes, sem o motivo", async () => {
    getSettings.mockReturnValue(new Promise(() => undefined));
    const user = setup();
    await renderBoard();
    await goToWednesday(user);

    expect(screen.queryByText(/você não atende/)).toBeNull();
    expect(screen.queryByText(/A IA não marca horários/)).toBeNull();
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "0 atendimentos",
    );
    expect(
      screen.getByRole("link", { name: "Criar agendamento" }),
    ).toBeVisible();
  });

  test("com a leitura da disponibilidade falhada o corpo fica como antes, sem o motivo", async () => {
    getSettings.mockRejectedValue(new Error("falha de rede"));
    const user = setup();
    await renderBoard();
    await goToWednesday(user);
    await waitFor(() => expect(getSettings).toHaveBeenCalled());

    expect(screen.queryByText(/você não atende/)).toBeNull();
    expect(screen.queryByText(/A IA não marca horários/)).toBeNull();
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "Quarta, 30",
    );
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "0 atendimentos",
    );
    expect(document.querySelector(".agenda-day-empty")).toHaveTextContent(
      "Nenhum atendimento neste dia.",
    );
    expect(
      screen.getByRole("link", { name: "Criar agendamento" }),
    ).toBeVisible();
  });

  test("a partir de 1024 px o painel de detalhe do dia fechado fica vazio, como no quadro", async () => {
    window.innerWidth = 1366;
    getSettings.mockResolvedValue(rulesFor(1, 2));
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [],
      initialView: "DAY",
    });
    const user = setup();
    await renderBoard();
    expect(
      await screen.findByText("Selecione um atendimento para ver os detalhes"),
    ).toBeVisible();

    await goToWednesday(user);

    expect(
      screen.getByRole("complementary", { name: "Detalhe do agendamento" }),
    ).toBeEmptyDOMElement();
  });

  test("a frase da IA nomeia cada dia da semana, de domingo a sábado", async () => {
    getSettings.mockResolvedValue(rulesFor());
    const user = setup();
    await renderBoard();
    // Terça 29 (hoje) e os seis dias seguintes, até a segunda 05/10.
    const expected = [
      "às terças",
      "às quartas",
      "às quintas",
      "às sextas",
      "aos sábados",
      "aos domingos",
      "às segundas",
    ];
    for (const [index, weekday] of expected.entries()) {
      if (index > 0) {
        await user.click(screen.getByRole("button", { name: "Próximo dia" }));
      }
      expect(
        await screen.findByText(
          `A IA não marca horários ${weekday}, mas você pode criar um atendimento por conta própria.`,
        ),
      ).toBeVisible();
    }
  });
});

describe("A4 — a folha 'O que você quer adicionar?'", () => {
  // Pedido de 2026-10-12 (D-169): bloqueio, compromisso pessoal e exceção
  // do dia viraram uma linha só, "Bloquear horário"; o horário extra foi
  // para Configurações > Agenda.
  test("Novo abre uma folha com nome acessível, duas linhas com título e descrição, e foco dentro", async () => {
    const user = setup();
    await renderBoard();

    const trigger = screen.getByRole("button", { name: "Novo" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(trigger);

    const sheet = screen.getByRole("dialog", { name: SHEET });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const rows: Array<[string, string, string]> = [
      ["Agendamento", "Atendimento para um cliente", "/agenda/novo"],
      [
        "Bloquear horário",
        "Pausa, compromisso ou dia fechado",
        "/agenda/bloquear",
      ],
    ];
    const links = within(sheet).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      rows.map(([, , href]) => href),
    );
    for (const [name, description, href] of rows) {
      const link = within(sheet).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAccessibleDescription(description);
    }
    expect(sheet.contains(document.activeElement)).toBe(true);
    await expectNoA11yViolations(sheet);
  });

  test("Agendamento só com createAppointments; Bloquear horário só com manageAvailability", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ createAppointments: true, manageAvailability: false }),
    );
    const user = setup();
    const first = await renderBoard();
    await user.click(screen.getByRole("button", { name: "Novo" }));
    let sheet = screen.getByRole("dialog", { name: SHEET });
    expect(within(sheet).getAllByRole("link")).toHaveLength(1);
    expect(
      within(sheet).getByRole("link", { name: "Agendamento" }),
    ).toBeVisible();
    first.unmount();

    getCalendar.mockResolvedValue(
      calendarFixture({ createAppointments: false, manageAvailability: true }),
    );
    await renderBoard();
    await user.click(screen.getByRole("button", { name: "Novo" }));
    sheet = screen.getByRole("dialog", { name: SHEET });
    expect(
      within(sheet)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([expect.stringContaining("Bloquear horário")]);
    expect(
      within(sheet).queryByRole("link", { name: "Agendamento" }),
    ).toBeNull();
  });

  test("sem nenhuma das duas capacidades, não há botão Novo", async () => {
    getCalendar.mockResolvedValue(
      calendarFixture({ createAppointments: false, manageAvailability: false }),
    );
    await renderBoard();

    expect(screen.queryByRole("button", { name: "Novo" })).toBeNull();
  });

  test("o foco fica preso na folha: Tab e Shift+Tab dão a volta", async () => {
    const user = setup();
    await renderBoard();
    await user.click(screen.getByRole("button", { name: "Novo" }));
    const sheet = screen.getByRole("dialog", { name: SHEET });
    const links = within(sheet).getAllByRole("link");

    expect(links[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(links.at(-1)).toHaveFocus();
    await user.tab();
    expect(links[0]).toHaveFocus();
  });

  test("Escape fecha a folha e o foco volta ao botão Novo", async () => {
    const user = setup();
    await renderBoard();
    const trigger = screen.getByRole("button", { name: "Novo" });
    await user.click(trigger);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("o escurecido fecha a folha e o foco volta ao botão Novo", async () => {
    const user = setup();
    await renderBoard();
    const trigger = screen.getByRole("button", { name: "Novo" });
    await user.click(trigger);

    const scrim = screen.getByRole("dialog", { name: SHEET }).parentElement!;
    await user.pointer({ keys: "[MouseLeft]", target: scrim });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  test("tocar numa linha leva ao destino e fecha a folha", async () => {
    const user = setup();
    await renderBoard();
    await user.click(screen.getByRole("button", { name: "Novo" }));

    await user.click(screen.getByRole("link", { name: "Bloquear horário" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("com prefers-reduced-motion a folha e o escurecido ficam parados", () => {
    const css = readFileSync(
      join(process.cwd(), "src/shared/styles/avenly-conversations.css"),
      "utf8",
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.chat-sheet-wrap,\s*\.chat-sheet,[^}]*\{[^}]*animation: none;/,
    );
  });
});

// ---------------------------------------------------------------------------
// A3 — o mini-calendário
// ---------------------------------------------------------------------------

function appointmentOn(date: string, id: string): Appointment {
  return {
    bufferAfterMinutes: 0,
    bufferBeforeMinutes: 0,
    comments: null,
    completedAt: null,
    completionOrigin: null,
    customer: { id: "c1", name: "Ana Paula", phone: null },
    customerId: "c1",
    date,
    durationMinutes: 60,
    endTime: "11:00",
    finalValue: null,
    id,
    noShowAt: null,
    noShowNote: null,
    presenceConfirmedAt: null,
    seriesId: null,
    services: [],
    source: "USER",
    startTime: "10:00",
    status: "CONFIRMED",
    title: null,
    totalPrice: 90,
    totalPriceType: "FIXED",
  };
}

/** Bloqueio de 24/09 inteiro em America/Sao_Paulo (UTC−3). */
const FULL_DAY_BLOCK = {
  endAt: "2026-09-25T02:59:00.000Z",
  id: "block-24",
  kind: "BLOCK",
  reason: null,
  seriesId: null,
  startAt: "2026-09-24T03:00:00.000Z",
  title: "Viagem",
} as TimeBlock;

/** Exceção que fecha o dia 28/09 inteiro. */
const FULL_DAY_CLOSURE = {
  available: false,
  date: "2026-09-28",
  endTime: null,
  id: "exc-28",
  reason: "Feriado",
  startTime: null,
} as unknown as AvailabilityException;

type QueryWindow = { endDate: string; startDate: string };

function inWindow(date: string, window: QueryWindow) {
  return date >= window.startDate && date <= window.endDate;
}

/**
 * Cada leitura devolve só o que cai na janela pedida: o 15/09 e o 20/10 ficam
 * fora da semana que o Dia já carregou, então o ponto deles só pode vir da
 * leitura do mês.
 */
function seedMonthData() {
  const appointments = [
    appointmentOn("2026-09-15", "apt-15"),
    appointmentOn("2026-09-30", "apt-30"),
    appointmentOn("2026-10-20", "apt-20"),
  ];
  listAppointments.mockImplementation((window: QueryWindow) =>
    Promise.resolve(appointments.filter((item) => inWindow(item.date, window))),
  );
  listTimeBlocks.mockImplementation((window: QueryWindow) =>
    Promise.resolve(inWindow("2026-09-24", window) ? [FULL_DAY_BLOCK] : []),
  );
  listAvailabilityExceptions.mockImplementation((window: QueryWindow) =>
    Promise.resolve(inWindow("2026-09-28", window) ? [FULL_DAY_CLOSURE] : []),
  );
}

// A grade tem sempre seis semanas (42 dias), então a janela lida também.
const SEPTEMBER_GRID = { endDate: "2026-10-11", startDate: "2026-08-31" };
const OCTOBER_GRID = { endDate: "2026-11-08", startDate: "2026-09-28" };

function titleButton(month = "Setembro") {
  return screen.getByRole("button", {
    name: `Abrir calendário, ${month} de 2026`,
  });
}

async function openCalendar(user: ReturnType<typeof setup>, month = "Setembro") {
  await user.click(titleButton(month));
  return screen.getByRole("dialog", { name: "Calendário" });
}

function calendarDay(sheet: HTMLElement, name: RegExp) {
  return within(sheet).getByRole("button", { name });
}

describe("A3 — o mini-calendário aberto pelo título", () => {
  test("o título é o botão 'Abrir calendário, {mês} de {ano}' com o chevron, e abre a folha do mês com SEG a DOM", async () => {
    const user = setup();
    await renderBoard();

    const title = titleButton();
    expect(title).toHaveAttribute("aria-haspopup", "dialog");
    expect(title).toHaveAttribute("aria-expanded", "false");
    expect(title.querySelector("svg path")).toHaveAttribute("d", "M6 9l6 6 6-6");

    const sheet = await openCalendar(user);
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(title).toHaveAttribute("aria-expanded", "true");
    expect(within(sheet).getByText("Setembro 2026")).toBeVisible();
    expect(
      Array.from(sheet.querySelectorAll(".agenda-calendar-weekdays span")).map(
        (item) => item.textContent,
      ),
    ).toEqual(["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"]);
    expect(within(sheet).getByText("Um ponto = dia com atendimentos")).toBeVisible();
    expect(within(sheet).getByRole("button", { name: "Ir para hoje" })).toBeVisible();
    expect(calendarDay(sheet, /^terça-feira, 29 de setembro/)).toHaveAttribute(
      "aria-current",
      "date",
    );
    expect(calendarDay(sheet, /^terça-feira, 29 de setembro/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(sheet.contains(document.activeElement)).toBe(true);
    await expectNoA11yViolations(sheet);
  });

  test("lê o mês da grade com as três leituras e marca ponto no dia com agendamento e fechado no dia inteiro bloqueado", async () => {
    seedMonthData();
    const user = setup();
    await renderBoard();
    const sheet = await openCalendar(user);

    await waitFor(() =>
      expect(
        calendarDay(sheet, /^terça-feira, 15 de setembro, com atendimentos$/),
      ).toBeVisible(),
    );
    expect(listAppointments).toHaveBeenCalledWith(
      SEPTEMBER_GRID,
      expect.any(AbortSignal),
    );
    expect(listTimeBlocks).toHaveBeenCalledWith(
      SEPTEMBER_GRID,
      expect.any(AbortSignal),
    );
    expect(listAvailabilityExceptions).toHaveBeenCalledWith(
      SEPTEMBER_GRID,
      expect.any(AbortSignal),
    );
    expect(
      calendarDay(sheet, /^quarta-feira, 30 de setembro, com atendimentos$/),
    ).toBeVisible();
    expect(
      calendarDay(sheet, /^quinta-feira, 24 de setembro, dia fechado$/),
    ).toHaveClass("is-closed");
    expect(
      calendarDay(sheet, /^segunda-feira, 28 de setembro, dia fechado$/),
    ).toHaveClass("is-closed");
    const plain = calendarDay(sheet, /^quarta-feira, 16 de setembro$/);
    expect(plain).not.toHaveClass("is-closed");
    expect(plain.querySelector(".has-appointment")).toBeNull();
    expect(
      calendarDay(sheet, /^terça-feira, 15 de setembro/).querySelector(
        ".has-appointment",
      ),
    ).not.toBeNull();
  });

  test("‹ › trocam de mês com uma leitura nova", async () => {
    seedMonthData();
    const user = setup();
    await renderBoard();
    const sheet = await openCalendar(user);

    await user.click(within(sheet).getByRole("button", { name: "Ver próximo mês" }));
    expect(within(sheet).getByText("Outubro 2026")).toBeVisible();
    await waitFor(() =>
      expect(
        calendarDay(sheet, /^terça-feira, 20 de outubro, com atendimentos$/),
      ).toBeVisible(),
    );
    expect(listAppointments).toHaveBeenCalledWith(
      OCTOBER_GRID,
      expect.any(AbortSignal),
    );

    await user.click(within(sheet).getByRole("button", { name: "Ver mês anterior" }));
    await user.click(within(sheet).getByRole("button", { name: "Ver mês anterior" }));
    expect(within(sheet).getByText("Agosto 2026")).toBeVisible();
    expect(listAppointments).toHaveBeenCalledWith(
      { endDate: "2026-09-06", startDate: "2026-07-27" },
      expect.any(AbortSignal),
    );
  });

  test("tocar num dia move a Agenda para a data, mantém o Dia, fecha a folha e devolve o foco ao título", async () => {
    seedMonthData();
    const user = setup();
    await renderBoard();
    const sheet = await openCalendar(user);

    await user.click(calendarDay(sheet, /^terça-feira, 15 de setembro/));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(titleButton()).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Dia" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() =>
      expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
        "Terça, 15",
      ),
    );
  });

  test("na Semana, o dia de outro mês move a Agenda e a Semana continua; 'Ir para hoje' volta para hoje", async () => {
    seedMonthData();
    const user = setup();
    await renderBoard();
    await user.click(screen.getByRole("tab", { name: "Semana" }));
    let sheet = await openCalendar(user);

    await user.click(within(sheet).getByRole("button", { name: "Ver próximo mês" }));
    await user.click(calendarDay(sheet, /^terça-feira, 20 de outubro/));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(titleButton("Outubro")).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    sheet = await openCalendar(user, "Outubro");
    expect(within(sheet).getByText("Outubro 2026")).toBeVisible();
    await user.click(within(sheet).getByRole("button", { name: "Ir para hoje" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(titleButton()).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Semana" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a falha da leitura do mês deixa a folha navegável, sem pontos e sem mensagem que bloqueie", async () => {
    listAppointments.mockImplementation((window: QueryWindow) =>
      window.startDate === SEPTEMBER_GRID.startDate
        ? Promise.reject(new Error("falha de rede"))
        : Promise.resolve([appointmentOn("2026-09-30", "apt-30")]),
    );
    const user = setup();
    await renderBoard();
    const sheet = await openCalendar(user);

    await waitFor(() =>
      expect(listAppointments).toHaveBeenCalledWith(
        SEPTEMBER_GRID,
        expect.any(AbortSignal),
      ),
    );
    expect(within(sheet).queryByRole("alert")).toBeNull();
    expect(sheet.querySelector(".has-appointment")).toBeNull();
    expect(calendarDay(sheet, /^quarta-feira, 30 de setembro$/)).toBeEnabled();

    await user.click(within(sheet).getByRole("button", { name: "Ver próximo mês" }));
    expect(within(sheet).getByText("Outubro 2026")).toBeVisible();
    await user.click(within(sheet).getByRole("button", { name: "Ver mês anterior" }));

    await user.click(calendarDay(sheet, /^quarta-feira, 30 de setembro$/));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
        "Quarta, 30",
      ),
    );
  });

  test("Escape fecha sem mover a Agenda, devolve o foco ao título e cancela a leitura em voo", async () => {
    let monthSignal: AbortSignal | undefined;
    listAppointments.mockImplementation(
      (window: QueryWindow, signal: AbortSignal) => {
        if (window.startDate !== SEPTEMBER_GRID.startDate) {
          return Promise.resolve([]);
        }
        monthSignal = signal;
        return new Promise(() => undefined);
      },
    );
    const user = setup();
    await renderBoard();
    await openCalendar(user);
    await waitFor(() => expect(monthSignal).toBeDefined());

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(titleButton()).toHaveFocus();
    expect(titleButton()).toHaveAttribute("aria-expanded", "false");
    expect(monthSignal?.aborted).toBe(true);
    expect(document.querySelector(".agenda-day-summary")).toHaveTextContent(
      "Hoje, terça 29",
    );
  });
});

// ---------------------------------------------------------------------------
// A12 — os dias visíveis
// ---------------------------------------------------------------------------

const WEEK_NAMES = [
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
  "Domingo",
];

async function openVisibleDays(user: ReturnType<typeof setup>, pill = "Seg–Sáb") {
  await user.click(screen.getByRole("tab", { name: "Semana" }));
  await user.click(await screen.findByRole("button", { name: pill }));
  return screen.getByRole("dialog", { name: "Dias visíveis" });
}

function daySwitch(sheet: HTMLElement, name: string) {
  return within(sheet).getByRole("switch", { name });
}

describe("A12 — a folha 'Dias visíveis' aberta pela pílula", () => {
  beforeEach(() => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0],
      initialView: null,
    });
    getSettings.mockResolvedValue(rulesFor(1, 2, 3, 4, 5, 6));
  });

  test("abre com os sete interruptores no estado lido e 'Você não atende neste dia' só sob o dia sem horário", async () => {
    const user = setup();
    await renderBoard();
    const sheet = await openVisibleDays(user);

    expect(
      within(sheet).getByText(
        "Escolha o que aparece em Semana e Mês. Isso não muda seus horários de atendimento.",
      ),
    ).toBeVisible();
    const switches = within(sheet).getAllByRole("switch");
    expect(switches.map((item) => item.getAttribute("aria-checked"))).toEqual([
      "true",
      "true",
      "true",
      "true",
      "true",
      "true",
      "false",
    ]);
    for (const name of WEEK_NAMES) expect(daySwitch(sheet, name)).toBeVisible();
    expect(within(sheet).getAllByText("Você não atende neste dia")).toHaveLength(1);
    expect(daySwitch(sheet, "Domingo")).toHaveAccessibleDescription(
      "Você não atende neste dia",
    );
    expect(
      within(sheet).getByText(
        "Se algum atendimento cair em um dia oculto, ele continua na visualização Dia e você recebe um aviso na semana.",
      ),
    ).toBeVisible();
    expect(sheet.contains(document.activeElement)).toBe(true);
    await expectNoA11yViolations(sheet);
  });

  test("os interruptores não gravam nada antes de 'Salvar', e fechar descarta o rascunho", async () => {
    const user = setup();
    await renderBoard();
    let sheet = await openVisibleDays(user);

    await user.click(daySwitch(sheet, "Sábado"));
    await user.click(daySwitch(sheet, "Domingo"));
    expect(daySwitch(sheet, "Sábado")).toHaveAttribute("aria-checked", "false");
    expect(daySwitch(sheet, "Domingo")).toHaveAttribute("aria-checked", "true");
    expect(updateAgendaViewPreference).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateAgendaViewPreference).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Seg–Sáb" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Seg–Sáb" }));
    sheet = screen.getByRole("dialog", { name: "Dias visíveis" });
    expect(daySwitch(sheet, "Sábado")).toHaveAttribute("aria-checked", "true");
    expect(daySwitch(sheet, "Domingo")).toHaveAttribute("aria-checked", "false");
  });

  test("'Salvar' grava só hiddenWeekdays, em ordem, fica desabilitado enquanto grava, e a Agenda aplica os dias sem reler", async () => {
    let finish: (value: { hiddenWeekdays: number[]; initialView: null }) => void =
      () => undefined;
    updateAgendaViewPreference.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = setup();
    await renderBoard();
    const sheet = await openVisibleDays(user);

    await user.click(daySwitch(sheet, "Sábado"));
    await user.click(daySwitch(sheet, "Segunda"));
    const save = within(sheet).getByRole("button", { name: "Salvar" });
    await user.click(save);

    expect(updateAgendaViewPreference).toHaveBeenCalledTimes(1);
    const body = updateAgendaViewPreference.mock.calls[0][0] as object;
    expect(body).toEqual({ hiddenWeekdays: [0, 1, 6] });
    expect(Object.keys(body)).toEqual(["hiddenWeekdays"]);
    expect(save).toBeDisabled();

    finish({ hiddenWeekdays: [0, 1, 6], initialView: null });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Ter–Sex" })).toBeVisible();
    expect(getAgendaViewPreference).toHaveBeenCalledTimes(1);
    const weekdays = Array.from(
      document.querySelectorAll(".week-map-weekday"),
    ).map((item) => item.textContent?.trim().slice(0, 3).toUpperCase());
    expect(weekdays).toEqual(["TER", "QUA", "QUI", "SEX"]);
  });

  test("mantém o limite de seis dias ocultos, com a frase de Configurações › Agenda", async () => {
    getAgendaViewPreference.mockResolvedValue({
      hiddenWeekdays: [0, 1, 2, 3, 4],
      initialView: null,
    });
    const user = setup();
    await renderBoard();
    const sheet = await openVisibleDays(user, "Sex, Sáb");

    expect(
      within(sheet).queryByText("Pelo menos um dia precisa aparecer na Agenda."),
    ).toBeNull();
    await user.click(daySwitch(sheet, "Sábado"));

    expect(
      within(sheet).getByText("Pelo menos um dia precisa aparecer na Agenda."),
    ).toBeVisible();
    expect(daySwitch(sheet, "Sexta")).toHaveAttribute("aria-checked", "true");
    expect(daySwitch(sheet, "Sexta")).toBeDisabled();
  });

  test("a recusa do servidor pelo limite mostra a frase do limite, e a folha fica aberta", async () => {
    updateAgendaViewPreference.mockRejectedValue(
      new BffHttpError({
        code: "VALIDATION_ERROR",
        details: { fieldErrors: { hiddenWeekdays: ["max 6"] } },
        message: "invalid",
        requestId: "r1",
        status: 400,
      }),
    );
    const user = setup();
    await renderBoard();
    const sheet = await openVisibleDays(user);

    await user.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Pelo menos um dia precisa aparecer na Agenda.",
    );
    expect(screen.getByRole("dialog", { name: "Dias visíveis" })).toBeVisible();
    expect(within(sheet).getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  test("outra falha mostra 'Não foi possível salvar os dias visíveis.', a folha fica aberta e a Agenda não muda", async () => {
    updateAgendaViewPreference.mockRejectedValue(new Error("falha de rede"));
    const user = setup();
    await renderBoard();
    const sheet = await openVisibleDays(user);

    await user.click(daySwitch(sheet, "Sábado"));
    await user.click(within(sheet).getByRole("button", { name: "Salvar" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Não foi possível salvar os dias visíveis.",
    );
    expect(screen.getByRole("dialog", { name: "Dias visíveis" })).toBeVisible();
    expect(daySwitch(sheet, "Sábado")).toHaveAttribute("aria-checked", "false");
    expect(within(sheet).getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Seg–Sáb" })).toBeVisible();
  });

  test("sem a disponibilidade lida, nenhum dia diz 'Você não atende neste dia'", async () => {
    getSettings.mockReturnValue(new Promise(() => undefined));
    const user = setup();
    await renderBoard();
    const sheet = await openVisibleDays(user);

    expect(within(sheet).queryByText("Você não atende neste dia")).toBeNull();
    expect(daySwitch(sheet, "Domingo")).toHaveAttribute("aria-checked", "false");
  });
});
